/**
 * Runs the hardware interface runtime and owns its updates. `bun run hwir`
 * starts this, and launchd keeps it alive.
 *
 * - Makes sure node_modules matches bun.lock, then runs
 *   `bun hardware-interface-runtime/index.tsx <args>` as a child, and
 *   restarts it with backoff whenever it exits.
 * - With HWIR_AUTO_UPDATE=true, fetches origin/main every minute. A commit
 *   that only touches ios/, docs/ or markdown is fast-forwarded in place.
 *   Anything else waits until the running commit has proven itself, then is
 *   checked in a staging worktree (install, typecheck, and a `bun run hwir
 *   --smoke` boot through this same file); only then is it fast-forwarded,
 *   and this process exits so launchd restarts on it.
 * - A commit that fails the check, or crash-loops after an update and gets
 *   rolled back to the last good commit, is never tried again.
 * - With --smoke (how the check runs it): the same startup, one runtime run
 *   with --smoke, exits with its code. No updates, no state written.
 *
 * Only Node built-ins and ./supervisorDecisions: this must keep working when
 * the rest of the repo is broken.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decideAfterCrash,
  decideUpdate,
  gateFailureBlamesCommit,
  markFailed,
  parseState,
  recentCrashes,
  type RepoFacts,
  stagingDirFor,
  stagingDirProblem,
  type SupervisorState,
} from "./supervisorDecisions";

const envMs = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeEntry = "hardware-interface-runtime/index.tsx";
const childArgs = process.argv.slice(2);
const smoke = childArgs.includes("--smoke");
const bun = process.execPath;
const autoUpdate = process.env.HWIR_AUTO_UPDATE === "true" && !smoke;
const stateFile =
  process.env.HWIR_SUPERVISOR_STATE ?? join(repo, ".hwir-supervisor.json");
const lockStampFile = join(repo, "node_modules", ".hwir-lock-stamp");
const stagingDir = stagingDirFor(repo, process.env.HWIR_STAGING_DIR);

const firstCheckMs = envMs("HWIR_FIRST_CHECK_MS", 10_000);
const checkEveryMs = envMs("HWIR_UPDATE_INTERVAL_MS", 60_000);
const stableAfterMs = envMs("HWIR_STABLE_MS", 5 * 60_000);
const crashPolicy = {
  limit: envMs("HWIR_CRASH_LIMIT", 3),
  windowMs: envMs("HWIR_CRASH_WINDOW_MS", 10 * 60_000),
};

const short = (sha: string) => sha.slice(0, 7);

const log = (message: string) =>
  console.log(
    `[${new Date().toISOString()}] [SUPERVISOR${smoke ? " smoke" : ""}] ${message}`,
  );

// The update check runs every minute, so it only logs when its answer changes.
let lastRepeatable = "";
/** A commit whose last check failed because of the machine, not the commit. */
let machineBlocked: string | undefined;
/** Failed checkouts in a row, for the commit being checked. */
let checkoutFailures = { sha: "", count: 0 };
const logIfChanged = (message: string) => {
  if (message === lastRepeatable) return;
  lastRepeatable = message;
  log(message);
};

// launchd's PATH is minimal, so look for git in the usual places too.
const findGit = () => {
  const dirs = [
    ...(process.env.PATH ?? "").split(delimiter),
    "/usr/bin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = join(dir, "git");
    if (existsSync(candidate)) return candidate;
  }
  return "git";
};
const git = findGit();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Running commands

type RunResult = { code: number; output: string };

/** Processes started by the gate, killed if we shut down mid-check. */
const gateProcesses = new Set<ChildProcess>();
/** Set when a rollback kills a running gate, so its result is ignored. */
let gateInterrupted = false;

const run = (
  command: string,
  args: string[],
  { cwd = repo, timeoutMs = 60_000 }: { cwd?: string; timeoutMs?: number } = {},
) =>
  new Promise<RunResult>((done) => {
    let output = "";
    const keep = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-20_000);
    };
    // Its own process group, so a timeout also kills what it started (tsgo).
    const proc = spawn(command, args, {
      cwd,
      env: process.env,
      detached: true,
    });
    gateProcesses.add(proc);
    const timer = setTimeout(() => {
      output += `\n(timed out after ${Math.round(timeoutMs / 1000)}s)`;
      killGroup(proc);
    }, timeoutMs);
    proc.stdout?.on("data", keep);
    proc.stderr?.on("data", keep);
    proc.on("error", (e) => {
      output += `\n${e}`;
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      gateProcesses.delete(proc);
      done({ code: code ?? 1, output: output.trim() });
    });
  });

const killGroup = (proc: ChildProcess) => {
  if (proc.pid === undefined) return;
  try {
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    proc.kill("SIGKILL");
  }
};

const gitOut = async (args: string[], cwd = repo) => {
  const result = await run(git, args, { cwd });
  if (result.code !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${result.output}`);
  return result.output;
};

/** `git merge-base --is-ancestor`: exit 0 is yes, 1 is no, anything else an error. */
const isAncestor = async (ancestor: string, of: string) => {
  const result = await run(git, ["merge-base", "--is-ancestor", ancestor, of]);
  if (result.code > 1)
    throw new Error(`git merge-base failed: ${result.output}`);
  return result.code === 0;
};

const headSha = () => gitOut(["rev-parse", "HEAD"]);
const isDirty = async () =>
  (await gitOut(["status", "--porcelain", "--untracked-files=no"])) !== "";

const tail = (text: string, lines = 30) =>
  text.split("\n").slice(-lines).join("\n");

// ---------------------------------------------------------------------------
// State file

const loadState = (): SupervisorState => {
  try {
    return parseState(readFileSync(stateFile, "utf8"));
  } catch {
    return parseState(null);
  }
};

let state = loadState();
let stateWritable = true;

/** Keeps `next` in memory either way; returns whether it reached the disk. */
const saveState = (next: SupervisorState) => {
  state = next;
  if (smoke) return true;
  try {
    writeFileSync(`${stateFile}.tmp`, JSON.stringify(next, null, 2) + "\n");
    renameSync(`${stateFile}.tmp`, stateFile);
    if (!stateWritable) log(`${stateFile} is writable again`);
    stateWritable = true;
  } catch (e) {
    if (stateWritable) log(`couldn't save ${stateFile}: ${e}`);
    stateWritable = false;
  }
  return stateWritable;
};

// ---------------------------------------------------------------------------
// Dependencies

const lockHash = () =>
  createHash("sha256")
    .update(readFileSync(join(repo, "bun.lock")))
    .update(readFileSync(join(repo, "package.json")))
    .digest("hex");

const readStamp = () => {
  try {
    return readFileSync(lockStampFile, "utf8").trim();
  } catch {
    return null;
  }
};

/**
 * Runs `bun install --frozen-lockfile` unless node_modules is stamped with
 * this bun.lock and package.json. The stamp is only written after an install
 * works, so a failed one is retried before every runtime start (the crash
 * backoff spaces them out).
 */
const ensureDependencies = async () => {
  try {
    const want = lockHash();
    if (readStamp() === want) return;
    log(`node_modules doesn't match bun.lock, running bun install`);
    // An install that fails partway can leave node_modules half-changed, so
    // the old stamp must go first or a rollback would trust it.
    rmSync(lockStampFile, { force: true });
    const result = await run(bun, ["install", "--frozen-lockfile"], {
      timeoutMs: 5 * 60_000,
    });
    if (result.code !== 0) {
      log(
        `bun install failed (code ${result.code}), starting the runtime anyway and retrying next start:\n${tail(result.output)}`,
      );
      return;
    }
    writeFileSync(lockStampFile, want + "\n");
    log(`bun install done`);
  } catch (e) {
    log(`couldn't check or install dependencies (${e}), starting anyway`);
  }
};

// ---------------------------------------------------------------------------
// The runtime child

let child: ChildProcess | null = null;
/** The commit the running child was started on. Only this one gets certified. */
let childSha: string | null = null;
let shuttingDown = false;
let stableTimer: ReturnType<typeof setTimeout> | undefined;
let restartTimer: ReturnType<typeof setTimeout> | undefined;
const crashTimes: number[] = [];
let crashesInARow = 0;
const expectedExits = new WeakSet<ChildProcess>();

const startChild = async () => {
  if (shuttingDown) return;
  await ensureDependencies();
  const sha = await headSha();
  if (shuttingDown) return;
  const startedAt = Date.now();
  const proc = spawn(bun, [runtimeEntry, ...childArgs], {
    cwd: repo,
    stdio: "inherit",
    env: {
      ...process.env,
      HWIR_SUPERVISED: "1",
      HWIR_SUPERVISOR_PID: String(process.pid),
    },
  });
  child = proc;
  childSha = sha;
  log(`runtime started on ${short(sha)} (pid ${proc.pid})`);

  stableTimer = setTimeout(() => {
    if (child !== proc || !childSha) return;
    crashesInARow = 0;
    // childSha, not HEAD: a docs-only fast-forward may have moved it on.
    markGood(childSha);
  }, stableAfterMs);

  let exited = false;
  const onExit = (code: number | null, why: string) => {
    if (exited) return;
    exited = true;
    if (child === proc) child = null;
    clearTimeout(stableTimer);
    if (smoke) {
      log(`runtime exited (${why})`);
      process.exit(code === 0 ? 0 : 1);
    }
    if (expectedExits.has(proc) || shuttingDown) return;
    void onCrash(why, Date.now() - startedAt);
  };
  proc.on("exit", (code, signal) =>
    onExit(code, signal ? `signal ${signal}` : `code ${code}`),
  );
  proc.on("error", (e) => onExit(null, `spawn error: ${e}`));
};

const restartChildIn = (delayMs: number) => {
  restartTimer = setTimeout(() => {
    startChild().catch((e) => {
      log(`couldn't start the runtime (${e}), trying again in 30s`);
      restartChildIn(30_000);
    });
  }, delayMs);
};

const stopChild = () =>
  new Promise<void>((done) => {
    clearTimeout(restartTimer);
    const proc = child;
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) {
      done();
      return;
    }
    expectedExits.add(proc);
    const killTimer = setTimeout(() => proc.kill("SIGKILL"), 10_000);
    proc.once("exit", () => {
      clearTimeout(killTimer);
      done();
    });
    proc.kill("SIGTERM");
  });

const markGood = (sha: string) => {
  if (state.lastGood === sha) return;
  saveState({ ...state, lastGood: sha });
  log(
    `runtime has run ${Math.round(stableAfterMs / 1000)}s on ${short(sha)}, marking it good`,
  );
};

const onCrash = async (why: string, ranForMs: number) => {
  const now = Date.now();
  crashTimes.push(now);
  while (crashTimes.length > 20) crashTimes.shift();
  crashesInARow = ranForMs >= stableAfterMs ? 1 : crashesInARow + 1;
  try {
    const head = await headSha();
    const action = decideAfterCrash({
      head,
      lastGood: state.lastGood,
      lastGoodIsAncestorOfHead: state.lastGood
        ? await isAncestor(state.lastGood, head)
        : false,
      dirty: await isDirty(),
      crashTimes,
      crashesInARow,
      now,
      policy: crashPolicy,
    });
    if (action.kind === "rollback") {
      log(`runtime exited (${why}); ${action.why}, rolling back`);
      await rollBack(head, action.to);
      return;
    }
    log(
      `runtime exited (${why}) after ${Math.round(ranForMs / 1000)}s; ${action.why}; restarting in ${action.delayMs / 1000}s`,
    );
    restartChildIn(action.delayMs);
  } catch (e) {
    log(`runtime exited (${why}); couldn't read git (${e}); restarting in 5s`);
    restartChildIn(5_000);
  }
};

const rollBack = async (bad: string, to: string) => {
  gateInterrupted = gateProcesses.size > 0;
  gateProcesses.forEach(killGroup);
  const reset = await run(git, ["reset", "--hard", to]);
  if (reset.code !== 0) {
    log(`rollback failed, restarting on ${short(bad)}: ${reset.output}`);
    restartChildIn(30_000);
    return;
  }
  const saved = saveState(
    markFailed(state, bad, `crash-looped, rolled back to ${short(to)}`),
  );
  log(
    `rolled back ${short(bad)} -> ${short(to)}, ${short(bad)} won't be retried`,
  );
  if (!saved) {
    // Restarting would forget the rejection, so stay up and keep it in memory.
    log(`the rejection is only in memory, restarting the runtime in place`);
    restartChildIn(0);
    return;
  }
  log(`exiting so launchd restarts on ${short(to)}`);
  shuttingDown = true;
  process.exit(0);
};

// ---------------------------------------------------------------------------
// Updates

let checking = false;

const readRepo = async (): Promise<RepoFacts> => {
  const head = await headSha();
  const origin = await gitOut(["rev-parse", "refs/remotes/origin/main"]);
  const branchResult = await run(git, [
    "symbolic-ref",
    "--short",
    "-q",
    "HEAD",
  ]);
  const headIsAncestorOfOrigin = await isAncestor(head, origin);
  return {
    head,
    origin,
    branch: branchResult.code === 0 ? branchResult.output : null,
    dirty: await isDirty(),
    headIsAncestorOfOrigin,
    originIsAncestorOfHead: await isAncestor(origin, head),
    changedPaths:
      headIsAncestorOfOrigin && head !== origin
        ? (await gitOut(["diff", "--name-only", head, origin]))
            .split("\n")
            .filter(Boolean)
        : [],
  };
};

const runtimeFacts = () => ({
  headCrashLooping:
    recentCrashes(crashTimes, Date.now(), crashPolicy.windowMs).length >= 2,
  // Retrying the write tells us when the disk has recovered.
  stateWritable: stateWritable || saveState(state),
});

/**
 * One update check. With rehearse (the smoke boot), everything runs except
 * the fetch and acting on the decision, so a broken check fails the gate.
 */
const checkForUpdate = async ({ rehearse = false } = {}) => {
  if (!rehearse) {
    const fetched = await run(git, ["fetch", "--quiet", "origin", "main"], {
      timeoutMs: 60_000,
    });
    if (fetched.code !== 0) {
      logIfChanged(`git fetch failed, will retry: ${tail(fetched.output, 3)}`);
      return;
    }
  }

  const repoFacts = await readRepo();
  const action = decideUpdate(repoFacts, state, runtimeFacts());
  if (rehearse) {
    log(`would decide: ${action.kind} (${action.why})`);
    return;
  }

  if (
    action.kind === "none" ||
    action.kind === "blocked" ||
    action.kind === "skip"
  ) {
    logIfChanged(action.why);
    return;
  }

  // A commit the machine couldn't check last time is retried every check;
  // say so once, not every minute.
  const retrying = machineBlocked === action.sha;
  if (!retrying) lastRepeatable = "";
  machineBlocked = undefined;
  if (action.kind === "fast-forward") {
    const merged = await run(git, ["merge", "--ff-only", action.sha]);
    if (merged.code !== 0) {
      saveState(markFailed(state, action.sha, "fast-forward failed"));
      log(`${action.why}, but the fast-forward failed: ${tail(merged.output)}`);
      return;
    }
    // Nothing the runtime runs changed, so it's still on "this" commit.
    if (childSha === repoFacts.head) childSha = action.sha;
    if (state.lastGood === repoFacts.head)
      saveState({ ...state, lastGood: action.sha });
    log(`${action.why}: fast-forwarded without a restart`);
    return;
  }

  if (!retrying) log(action.why);
  gateInterrupted = false;
  const failure = await runGate(action.sha);
  // A rollback or shutdown killed the check: that says nothing about the commit.
  if (shuttingDown || gateInterrupted) return;
  if (failure?.step === "staging checkout")
    checkoutFailures = {
      sha: action.sha,
      count:
        checkoutFailures.sha === action.sha ? checkoutFailures.count + 1 : 1,
    };
  if (
    failure &&
    !gateFailureBlamesCommit(failure.step, checkoutFailures.count)
  ) {
    machineBlocked = action.sha;
    logIfChanged(
      `couldn't check ${short(action.sha)} (${failure.step}), staying on ${short(repoFacts.head)} and trying again next check:\n${tail(failure.output)}`,
    );
    return;
  }
  if (failure) {
    saveState(markFailed(state, action.sha, failure.step));
    log(
      `${short(action.sha)} failed ${failure.step}, staying on ${short(repoFacts.head)} and never retrying it:\n${tail(failure.output)}`,
    );
    return;
  }
  await applyUpdate(repoFacts.head, action.sha);
};

const applyUpdate = async (from: string, to: string) => {
  // Something may have changed while the gate ran (minutes).
  if ((await headSha()) !== from || (await isDirty())) {
    log(`the checkout changed while checking ${short(to)}, not updating`);
    return;
  }
  // The rollback target (lastGood) must be on disk before we move.
  if (!saveState(state)) {
    log(`can't write ${stateFile}, not updating to ${short(to)}`);
    return;
  }
  const merged = await run(git, ["merge", "--ff-only", to]);
  if (merged.code !== 0) {
    saveState(markFailed(state, to, "fast-forward failed"));
    log(
      `${short(to)} passed, but the fast-forward failed: ${tail(merged.output)}`,
    );
    return;
  }
  log(
    `${short(to)} passed, fast-forwarded ${short(from)} -> ${short(to)}, exiting so launchd restarts on it`,
  );
  // Dependencies are installed by the next start, which checks bun.lock.
  shuttingDown = true;
  await stopChild();
  process.exit(0);
};

type GateFailure = { step: string; output: string };

/** Checks a commit in the staging worktree. Returns why it failed, or null. */
const runGate = async (sha: string): Promise<GateFailure | null> => {
  const misplaced = stagingDirProblem(repo, stagingDir);
  if (misplaced)
    return {
      step: "staging dir",
      output: `${misplaced}. Set HWIR_STAGING_DIR in .env.local to a folder of its own on the internal disk.`,
    };
  const unwritable = await probeStagingDir();
  if (unwritable) return { step: "staging dir", output: unwritable };
  const checkout = await prepareStaging(sha);
  if (checkout) return checkout;

  // launchd always runs `bun run hwir`, so a commit that changes what that
  // script runs can't be proven here. It needs a person on the machine.
  const entry = (dir: string) => {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      return String(pkg.scripts?.hwir);
    } catch {
      return "(unreadable package.json)";
    }
  };
  if (entry(stagingDir) !== entry(repo))
    return {
      step: "entry point check",
      output: `package.json's hwir script changed from "${entry(repo)}" to "${entry(stagingDir)}"; update the machine by hand`,
    };

  // The smoke boot goes through package.json's script and this file, so a
  // broken supervisor fails here instead of on the lights.
  const steps: [string, string[], number][] = [
    ["install", ["install", "--frozen-lockfile"], 5 * 60_000],
    ["typecheck", ["run", "typecheck"], 5 * 60_000],
    ["smoke boot", ["run", "hwir", ...childArgs, "--smoke"], 3 * 60_000],
  ];
  for (const [step, args, timeoutMs] of steps) {
    if (shuttingDown || gateInterrupted)
      return { step: "interrupted", output: "" };
    const started = Date.now();
    const result = await run(bun, args, { cwd: stagingDir, timeoutMs });
    const secs = Math.round((Date.now() - started) / 1000);
    if (result.code !== 0)
      return {
        step,
        output: `${step} exited ${result.code} after ${secs}s\n${result.output}`,
      };
    log(`  ${short(sha)} ${step}: ok (${secs}s)`);
  }
  return null;
};

/**
 * Checks the staging dir can be written, in a child process with a short
 * timeout, so a disk the daemon can't reach fails in seconds with a clear
 * message instead of hanging a checkout. Returns an error message, or null.
 */
const probeStagingDir = async (): Promise<string | null> => {
  // mktemp creates a new file of its own, so it can't follow a planted
  // symlink or trip over something already there.
  const result = await run(
    "/bin/sh",
    [
      "-c",
      'mkdir -p "$1" && f=$(mktemp "$1/.hwir-write-probe.XXXXXX") && rm -f "$f"',
      "sh",
      stagingDir,
    ],
    { timeoutMs: 15_000 },
  );
  if (result.code === 0) return null;
  return `can't write to ${stagingDir} (${tail(result.output, 2) || `exit ${result.code}`}). Set HWIR_STAGING_DIR in .env.local to a folder on the internal disk.`;
};

/** Puts the staging worktree on sha. Returns why it couldn't, or null. */
const prepareStaging = async (sha: string): Promise<GateFailure | null> => {
  if (await isOurWorktree(stagingDir)) {
    const checkout = await run(git, ["checkout", "--detach", "--force", sha], {
      cwd: stagingDir,
    });
    // Keeps node_modules (ignored), so installs stay quick.
    if (checkout.code === 0) {
      const cleaned = await run(git, ["clean", "-fd"], { cwd: stagingDir });
      if (cleaned.code === 0) return null;
    }
    log(
      `staging worktree is broken, recreating it: ${tail(checkout.output, 3)}`,
    );
  }
  if (!isOursToReplace(stagingDir))
    return {
      step: "staging dir",
      output: `${stagingDir} has something in it that isn't this repo's staging worktree, so it's left alone. Empty it, or set HWIR_STAGING_DIR to a folder of its own.`,
    };
  rmSync(stagingDir, { recursive: true, force: true });
  await run(git, ["worktree", "prune"]);
  const added = await run(git, [
    "worktree",
    "add",
    "--detach",
    "--force",
    stagingDir,
    sha,
  ]);
  return added.code === 0
    ? null
    : { step: "staging checkout", output: added.output };
};

/**
 * Whether the staging dir may be deleted and recreated: it's missing, empty,
 * or a (maybe broken) worktree whose .git file points into this repo. Never
 * a folder someone pointed HWIR_STAGING_DIR at by mistake.
 */
const isOursToReplace = (dir: string) => {
  try {
    if (!existsSync(dir)) return true;
    if (readdirSync(dir).length === 0) return true;
    const gitFile = readFileSync(join(dir, ".git"), "utf8");
    const gitdir = /^gitdir: (.+)$/m.exec(gitFile)?.[1]?.trim();
    return (
      gitdir !== undefined &&
      resolve(dir, gitdir).startsWith(`${join(repo, ".git", "worktrees")}/`)
    );
  } catch {
    return false;
  }
};

/** A worktree of this repo (not some other checkout's staging dir). */
const isOurWorktree = async (dir: string) => {
  if (!existsSync(join(dir, ".git"))) return false;
  const commonDir = (cwd: string) =>
    run(git, ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd,
    });
  const [ours, theirs] = await Promise.all([commonDir(repo), commonDir(dir)]);
  return theirs.code === 0 && theirs.output === ours.output;
};

const scheduleChecks = () => {
  const check = async () => {
    if (checking || shuttingDown) return;
    checking = true;
    try {
      await checkForUpdate();
    } catch (e) {
      logIfChanged(`update check failed: ${e}`);
    } finally {
      checking = false;
    }
  };
  setTimeout(() => {
    void check();
    setInterval(() => void check(), checkEveryMs);
  }, firstCheckMs);
};

// ---------------------------------------------------------------------------

const shutdown = async (signal: NodeJS.Signals) => {
  if (shuttingDown && !child) process.exit(0);
  shuttingDown = true;
  clearTimeout(restartTimer);
  log(`${signal} received, stopping the runtime`);
  gateProcesses.forEach(killGroup);
  if (child) {
    expectedExits.add(child);
    child.kill(signal);
  }
  const deadline = Date.now() + 10_000;
  while (child && child.exitCode === null && child.signalCode === null) {
    if (Date.now() > deadline) {
      child.kill("SIGKILL");
      break;
    }
    await sleep(100);
  }
  process.exit(0);
};

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const)
  process.on(signal, () => void shutdown(signal));

const head = await headSha().catch(() => "unknown");
log(
  `starting at ${short(head)} (last good ${state.lastGood ? short(state.lastGood) : "none yet"}), ` +
    `auto-update ${autoUpdate ? "on" : "off"}, runtime args: ${childArgs.join(" ") || "(none)"}`,
);
if (smoke)
  // Exercise the update check too, short of fetching or changing anything.
  // If it throws, the smoke boot fails.
  await checkForUpdate({ rehearse: true });

await startChild().catch((e) => {
  log(`couldn't start the runtime (${e}), trying again in 5s`);
  restartChildIn(5_000);
});
if (autoUpdate) scheduleChecks();
