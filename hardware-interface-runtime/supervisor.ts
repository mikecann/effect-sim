/**
 * Runs the hardware interface runtime and owns its updates. `bun run hwir`
 * starts this, and launchd keeps it alive.
 *
 * - Runs `bun hardware-interface-runtime/index.tsx <args>` as a child, and
 *   restarts it with backoff whenever it exits.
 * - With HWIR_AUTO_UPDATE=true, fetches origin/main every minute. A commit
 *   that only touches ios/, docs/ or markdown is fast-forwarded in place.
 *   Anything else is checked in a staging worktree first (install,
 *   typecheck, this file's self-test, a --smoke boot); only then is it
 *   fast-forwarded, and this process exits so launchd restarts on it.
 * - A commit that fails the check, or crash-loops after an update and gets
 *   rolled back to the last good commit, is never tried again.
 *
 * Only Node built-ins and ./supervisorDecisions: this must keep working when
 * the rest of the repo is broken.
 */
import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decideAfterCrash,
  decideUpdate,
  markFailed,
  parseState,
  type RepoFacts,
  type SupervisorState,
} from "./supervisorDecisions";

const envMs = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeEntry = "hardware-interface-runtime/index.tsx";
const supervisorEntry = "hardware-interface-runtime/supervisor.ts";
const childArgs = process.argv.slice(2).filter((a) => a !== "--self-test");
const bun = process.execPath;
const autoUpdate = process.env.HWIR_AUTO_UPDATE === "true";
const stateFile =
  process.env.HWIR_SUPERVISOR_STATE ?? join(repo, ".hwir-supervisor.json");
const stagingDir =
  process.env.HWIR_STAGING_DIR ??
  join(dirname(repo), `${basename(repo)}-staging`);

const firstCheckMs = envMs("HWIR_FIRST_CHECK_MS", 10_000);
const checkEveryMs = envMs("HWIR_UPDATE_INTERVAL_MS", 60_000);
const stableAfterMs = envMs("HWIR_STABLE_MS", 5 * 60_000);
const crashPolicy = {
  limit: envMs("HWIR_CRASH_LIMIT", 3),
  windowMs: envMs("HWIR_CRASH_WINDOW_MS", 10 * 60_000),
};

const short = (sha: string) => sha.slice(0, 7);

const log = (message: string) =>
  console.log(`[${new Date().toISOString()}] [SUPERVISOR] ${message}`);

// The update check runs every minute, so it only logs when its answer changes.
let lastRepeatable = "";
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

// ---------------------------------------------------------------------------
// Running commands

type RunResult = { code: number; output: string };

/** Processes started by the gate, killed if we shut down mid-check. */
const gateProcesses = new Set<ChildProcess>();

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

const saveState = (next: SupervisorState) => {
  state = next;
  try {
    writeFileSync(`${stateFile}.tmp`, JSON.stringify(next, null, 2) + "\n");
    renameSync(`${stateFile}.tmp`, stateFile);
  } catch (e) {
    log(`couldn't save ${stateFile}: ${e}`);
  }
};

// ---------------------------------------------------------------------------
// The runtime child

let child: ChildProcess | null = null;
let shuttingDown = false;
let stableTimer: ReturnType<typeof setTimeout> | undefined;
let restartTimer: ReturnType<typeof setTimeout> | undefined;
const crashTimes: number[] = [];
let crashesInARow = 0;
const expectedExits = new WeakSet<ChildProcess>();

const startChild = () => {
  if (shuttingDown) return;
  const startedAt = Date.now();
  const proc = spawn(bun, [runtimeEntry, ...childArgs], {
    cwd: repo,
    stdio: "inherit",
    env: { ...process.env, HWIR_SUPERVISED: "1" },
  });
  child = proc;
  log(`runtime started (pid ${proc.pid})`);

  stableTimer = setTimeout(() => {
    if (child !== proc) return;
    crashesInARow = 0;
    void markGood();
  }, stableAfterMs);

  let exited = false;
  const onExit = (why: string) => {
    if (exited) return;
    exited = true;
    if (child === proc) child = null;
    clearTimeout(stableTimer);
    if (expectedExits.has(proc) || shuttingDown) return;
    void onCrash(why, Date.now() - startedAt);
  };
  proc.on("exit", (code, signal) =>
    onExit(signal ? `signal ${signal}` : `code ${code}`),
  );
  proc.on("error", (e) => onExit(`spawn error: ${e}`));
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

const markGood = async () => {
  try {
    const head = await headSha();
    if (state.lastGood === head) return;
    saveState({ ...state, lastGood: head });
    log(
      `runtime has run ${Math.round(stableAfterMs / 1000)}s on ${short(head)}, marking it good`,
    );
  } catch (e) {
    log(`couldn't mark the current commit good: ${e}`);
  }
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
    restartTimer = setTimeout(startChild, action.delayMs);
  } catch (e) {
    log(`runtime exited (${why}); couldn't read git (${e}); restarting in 5s`);
    restartTimer = setTimeout(startChild, 5_000);
  }
};

const rollBack = async (bad: string, to: string) => {
  shuttingDown = true;
  gateProcesses.forEach(killGroup);
  const reset = await run(git, ["reset", "--hard", to]);
  if (reset.code !== 0) {
    log(`rollback failed, restarting on ${short(bad)}: ${reset.output}`);
    shuttingDown = false;
    restartTimer = setTimeout(startChild, 30_000);
    return;
  }
  saveState(
    markFailed(state, bad, `crash-looped, rolled back to ${short(to)}`),
  );
  log(
    `rolled back ${short(bad)} -> ${short(to)}, ${short(bad)} won't be retried`,
  );
  await install();
  log(`exiting so launchd restarts on ${short(to)}`);
  process.exit(0);
};

const install = async () => {
  const result = await run(bun, ["install", "--frozen-lockfile"], {
    timeoutMs: 5 * 60_000,
  });
  if (result.code !== 0)
    log(`bun install failed (code ${result.code}):\n${tail(result.output)}`);
  return result.code === 0;
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

const checkForUpdate = async () => {
  const fetched = await run(git, ["fetch", "--quiet", "origin", "main"], {
    timeoutMs: 60_000,
  });
  if (fetched.code !== 0) {
    logIfChanged(`git fetch failed, will retry: ${tail(fetched.output, 3)}`);
    return;
  }

  const repoFacts = await readRepo();
  const action = decideUpdate(repoFacts, state);

  if (
    action.kind === "none" ||
    action.kind === "blocked" ||
    action.kind === "skip"
  ) {
    logIfChanged(action.why);
    return;
  }

  lastRepeatable = "";
  if (action.kind === "fast-forward") {
    const merged = await run(git, ["merge", "--ff-only", action.sha]);
    if (merged.code !== 0) {
      saveState(markFailed(state, action.sha, "fast-forward failed"));
      log(`${action.why}, but the fast-forward failed: ${tail(merged.output)}`);
      return;
    }
    if (state.lastGood === repoFacts.head)
      saveState({ ...state, lastGood: action.sha });
    log(`${action.why}: fast-forwarded without a restart`);
    return;
  }

  log(action.why);
  const failure = await runGate(action.sha);
  // A rollback or shutdown killed the check: that says nothing about the commit.
  if (shuttingDown) return;
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
  const merged = await run(git, ["merge", "--ff-only", to]);
  if (merged.code !== 0) {
    saveState(markFailed(state, to, "fast-forward failed"));
    log(
      `${short(to)} passed, but the fast-forward failed: ${tail(merged.output)}`,
    );
    return;
  }
  log(`${short(to)} passed, fast-forwarded ${short(from)} -> ${short(to)}`);
  shuttingDown = true;
  await stopChild();
  if (!(await install())) {
    saveState(markFailed(state, to, "bun install failed after switching"));
    await run(git, ["reset", "--hard", from]);
    await install();
    log(`went back to ${short(from)}`);
  }
  log(`exiting so launchd restarts on the new code`);
  process.exit(0);
};

type GateFailure = { step: string; output: string };

/** Checks a commit in the staging worktree. Returns why it failed, or null. */
const runGate = async (sha: string): Promise<GateFailure | null> => {
  const checkout = await prepareStaging(sha);
  if (checkout) return { step: "staging checkout", output: checkout };

  const steps: [string, string[], number][] = [
    ["install", ["install", "--frozen-lockfile"], 5 * 60_000],
    ["typecheck", ["run", "typecheck"], 5 * 60_000],
    ["supervisor self-test", [supervisorEntry, "--self-test"], 60_000],
    ["smoke boot", [runtimeEntry, "--smoke", ...childArgs], 2 * 60_000],
  ];
  for (const [step, args, timeoutMs] of steps) {
    if (shuttingDown) return { step: "interrupted", output: "" };
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

/** Puts the staging worktree on sha. Returns an error message, or null. */
const prepareStaging = async (sha: string): Promise<string | null> => {
  if (existsSync(join(stagingDir, ".git"))) {
    const checkout = await run(git, ["checkout", "--detach", "--force", sha], {
      cwd: stagingDir,
    });
    // Keeps node_modules (ignored), so installs stay quick.
    if (checkout.code === 0) {
      await run(git, ["clean", "-fd"], { cwd: stagingDir });
      return null;
    }
    log(
      `staging worktree is broken, recreating it: ${tail(checkout.output, 3)}`,
    );
  }
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
  return added.code === 0 ? null : added.output;
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
// Self-test (run by the gate on the new commit's copy of this file)

const selfTest = async () => {
  const facts: RepoFacts = {
    head: "a".repeat(40),
    origin: "b".repeat(40),
    branch: "main",
    dirty: false,
    headIsAncestorOfOrigin: true,
    originIsAncestorOfHead: false,
    changedPaths: ["hardware-interface-runtime/index.tsx"],
  };
  const checks: [string, boolean][] = [
    [
      "new commit is gated",
      decideUpdate(facts, parseState(null)).kind === "gate",
    ],
    [
      "docs-only commit fast-forwards",
      decideUpdate({ ...facts, changedPaths: ["docs/a.md"] }, parseState(null))
        .kind === "fast-forward",
    ],
    [
      "diverged checkout is left alone",
      decideUpdate(
        { ...facts, headIsAncestorOfOrigin: false },
        parseState(null),
      ).kind === "blocked",
    ],
    ["git runs", (await run(git, ["--version"])).code === 0],
    ["runtime entry exists", existsSync(join(repo, runtimeEntry))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  checks.forEach(([name, ok]) =>
    console.log(`${ok ? "ok  " : "FAIL"} ${name}`),
  );
  process.exit(failed.length === 0 ? 0 : 1);
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
    await new Promise((r) => setTimeout(r, 100));
  }
  process.exit(0);
};

if (process.argv.includes("--self-test")) await selfTest();
else {
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const)
    process.on(signal, () => void shutdown(signal));

  const head = await headSha().catch(() => "unknown");
  log(
    `starting at ${short(head)} (last good ${state.lastGood ? short(state.lastGood) : "none yet"}), ` +
      `auto-update ${autoUpdate ? "on" : "off"}, runtime args: ${childArgs.join(" ") || "(none)"}`,
  );
  startChild();
  if (autoUpdate) scheduleChecks();
}
