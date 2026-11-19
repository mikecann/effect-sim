/**
 * The supervisor's decisions, as pure functions so they can be tested without
 * git or a running runtime. supervisor.ts gathers the facts, asks these what
 * to do, and does it. No imports: the supervisor must keep working even when
 * the rest of the repo is broken.
 */

/** What the supervisor remembers between runs (.hwir-supervisor.json). */
export type SupervisorState = {
  /** The last commit the runtime ran on for a while without exiting. */
  lastGood?: string;
  /** Commits that failed the gate or were rolled back, with why. Never retried. */
  failed: Record<string, string>;
};

/**
 * Where commits are checked: HWIR_STAGING_DIR, else next to the repo
 * (`<repo>-staging`). Never an external disk: launchd's daemon can't reach
 * removable volumes, and on 18 Nov `git worktree add` into
 * /Volumes/TinkerSSD hung until it timed out.
 */
export const stagingDirFor = (repo: string, override?: string) =>
  override?.trim() ? override.trim() : `${repo.replace(/\/+$/, "")}-staging`;

/**
 * Whether a failed gate step says something about the commit. A staging dir
 * that can't be written or checked out into is the machine's problem, so the
 * commit is tried again next time instead of being marked failed forever.
 */
export const gateFailureBlamesCommit = (step: string) =>
  step !== "staging dir" && step !== "staging checkout";

export const emptyState = (): SupervisorState => ({ failed: {} });

/** Reads the state file's contents, treating anything unexpected as empty. */
export const parseState = (json: string | null): SupervisorState => {
  if (!json) return emptyState();
  try {
    const raw = JSON.parse(json) as Partial<SupervisorState>;
    return {
      lastGood: typeof raw.lastGood === "string" ? raw.lastGood : undefined,
      failed:
        raw.failed && typeof raw.failed === "object" ? { ...raw.failed } : {},
    };
  } catch {
    return emptyState();
  }
};

/** Keeps the failed list from growing forever: the newest 50 are plenty. */
export const markFailed = (
  state: SupervisorState,
  sha: string,
  reason: string,
): SupervisorState => {
  const entries = Object.entries(state.failed).filter(([s]) => s !== sha);
  entries.push([sha, reason]);
  return { ...state, failed: Object.fromEntries(entries.slice(-50)) };
};

/** The checkout and origin/main, as seen after a fetch. */
export type RepoFacts = {
  head: string;
  origin: string;
  /** The checked-out branch, or null when HEAD is detached. */
  branch: string | null;
  /** Uncommitted changes to tracked files. */
  dirty: boolean;
  /** HEAD is an ancestor of origin/main. */
  headIsAncestorOfOrigin: boolean;
  /** origin/main is an ancestor of HEAD. */
  originIsAncestorOfHead: boolean;
  /** Files changed between HEAD and origin/main. */
  changedPaths: string[];
};

export type UpdateAction =
  | { kind: "none"; why: string }
  | { kind: "blocked"; why: string }
  | { kind: "skip"; sha: string; why: string }
  | { kind: "fast-forward"; sha: string; why: string }
  | { kind: "gate"; sha: string; why: string };

/** Changes that can't affect the runtime, so they need no check or restart. */
export const isDocsOnlyPath = (path: string) =>
  path.startsWith("ios/") || path.startsWith("docs/") || path.endsWith(".md");

const short = (sha: string) => sha.slice(0, 7);

/** What the supervisor knows beyond git. */
export type RuntimeFacts = {
  /** The runtime keeps crashing on HEAD (2+ crashes in the crash window). */
  headCrashLooping: boolean;
  /** The last write to the state file worked, so a rejection would stick. */
  stateWritable: boolean;
};

export const decideUpdate = (
  repo: RepoFacts,
  state: SupervisorState,
  runtime: RuntimeFacts,
): UpdateAction => {
  if (repo.head === repo.origin)
    return { kind: "none", why: `up to date at ${short(repo.head)}` };
  if (repo.branch === null)
    return { kind: "blocked", why: "HEAD is detached, not updating" };
  if (repo.dirty)
    return {
      kind: "blocked",
      why: "the checkout has uncommitted changes, not updating",
    };
  if (repo.originIsAncestorOfHead)
    return {
      kind: "blocked",
      why: `${short(repo.head)} is ahead of origin/main ${short(repo.origin)}, not updating`,
    };
  if (!repo.headIsAncestorOfOrigin)
    return {
      kind: "blocked",
      why: `${short(repo.head)} has diverged from origin/main ${short(repo.origin)}, not updating`,
    };

  const failure = state.failed[repo.origin];
  if (failure)
    return {
      kind: "skip",
      sha: repo.origin,
      why: `origin/main ${short(repo.origin)} failed before (${failure}), waiting for a newer commit`,
    };

  if (repo.changedPaths.length > 0 && repo.changedPaths.every(isDocsOnlyPath))
    return {
      kind: "fast-forward",
      sha: repo.origin,
      why: `${short(repo.origin)} only changes ios/, docs/ or markdown`,
    };

  // A failure must be remembered, or the same commit gets retried forever.
  if (!runtime.stateWritable)
    return {
      kind: "blocked",
      why: "the state file can't be written, not updating until it can",
    };

  // Only replace a commit that has proven itself, so there's always something
  // to roll back to. A crash-looping HEAD is the exception: the fix has to
  // arrive somehow.
  if (repo.head !== state.lastGood && !runtime.headCrashLooping)
    return {
      kind: "blocked",
      why: `${short(repo.head)} hasn't run long enough to count as good yet, waiting before updating to ${short(repo.origin)}`,
    };

  return {
    kind: "gate",
    sha: repo.origin,
    why: `${short(repo.origin)} is new, checking it before switching`,
  };
};

export type ExitAction =
  | { kind: "restart"; delayMs: number; why: string }
  | { kind: "rollback"; to: string; why: string };

export type CrashPolicy = {
  /** This many crashes within windowMs, on an unproven commit, rolls back. */
  limit: number;
  windowMs: number;
};

/** Waits longer after each crash in a row: 1 s, 2 s, 4 s ... up to 30 s. */
export const backoffMs = (crashesInARow: number) =>
  Math.min(1000 * 2 ** Math.max(0, crashesInARow - 1), 30_000);

/** Crashes still inside the window, newest last. */
export const recentCrashes = (
  crashTimes: number[],
  now: number,
  windowMs: number,
) => crashTimes.filter((t) => now - t <= windowMs);

/**
 * After the runtime exited on its own (a crash). Rolls back only when the
 * current commit hasn't proven itself (it isn't lastGood), lastGood is behind
 * it on the same line of history, and nothing local would be thrown away.
 */
export const decideAfterCrash = ({
  head,
  lastGood,
  lastGoodIsAncestorOfHead,
  dirty,
  crashTimes,
  crashesInARow,
  now,
  policy,
}: {
  head: string;
  lastGood: string | undefined;
  lastGoodIsAncestorOfHead: boolean;
  dirty: boolean;
  crashTimes: number[];
  crashesInARow: number;
  now: number;
  policy: CrashPolicy;
}): ExitAction => {
  const delayMs = backoffMs(crashesInARow);
  const recent = recentCrashes(crashTimes, now, policy.windowMs).length;
  const minutes = Math.round(policy.windowMs / 60_000);
  const restart = (why: string): ExitAction => ({
    kind: "restart",
    delayMs,
    why,
  });

  if (recent < policy.limit)
    return restart(`${recent} crash(es) in the last ${minutes} min`);
  if (!lastGood)
    return restart(`crash-looping but there's no last good commit yet`);
  if (lastGood === head)
    return restart(`crash-looping on the last good commit ${short(head)}`);
  if (!lastGoodIsAncestorOfHead)
    return restart(
      `crash-looping, but last good ${short(lastGood)} isn't behind ${short(head)}, not rolling back`,
    );
  if (dirty)
    return restart(
      `crash-looping, but the checkout has uncommitted changes, not rolling back`,
    );
  return {
    kind: "rollback",
    to: lastGood,
    why: `${recent} crashes in ${minutes} min on ${short(head)}`,
  };
};
