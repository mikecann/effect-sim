# Hardware Interface Runtime

This part interfaces with the hardware and can optionally play playlists directly without driving the UI.

## Running

```bash
bun run hwir
```

The CLI will prompt you to select a project and playlist each time you start.

### CLI Options

```bash
# Normal startup (always prompts)
bun run hwir

# Specify project/playlist directly (skips prompts)
bun run hwir -p <projectId> -l <playlistId>

# Everything runs, but shared/outsideWorld.ts blocks UDP, WLED and smart plug
# calls, Convex mutations and Home Assistant: safe beside the live runtime
bun run hwir -p <projectId> -l <playlistId> --dry-run

# Boot, load the project, run ~2 s of frames with no side effects, exit 0
# (non-zero on any error, or after HWIR_SMOKE_TIMEOUT_MS, default 60 s)
bun hardware-interface-runtime/index.tsx -p <projectId> -l <playlistId> --smoke
```

## Token and heartbeat

Every Convex mutation HWIR sends carries `HWIR_TOKEN`, read from `.env.local` (the same value as the deployment's `HWIR_TOKEN` env var, see `convex/roles.ts`). Without it, mutations work only until the deployment sets `REQUIRE_TOKENS=true`. Every 10 s HWIR sends a heartbeat (`hwir:heartbeat`: commit, frame rate, each string's connection), which keeps the `hwirPresence` machine online. `--dry-run` and `--smoke` send none of these.

## Supervisor and updates

`bun run hwir` runs `supervisor.ts`, which runs the runtime (`index.tsx`, with the same arguments) as a child and restarts it with backoff (1 s doubling to 30 s) whenever it exits. The supervisor only uses Node built-ins, so it keeps working when the rest of the repo is broken.

Before each start it checks that `node_modules` matches `bun.lock` and `package.json` (a hash stamped in `node_modules/.hwir-lock-stamp` after an install works) and runs `bun install --frozen-lockfile` if not. A failed install is retried before the next start.

With `HWIR_AUTO_UPDATE=true` (in `.env.local`) it also keeps the checkout on `origin/main`. Every minute it runs `git fetch origin main` and:

- does nothing unless `origin/main` is strictly ahead of `HEAD` (fast-forward only). A dirty, detached, ahead or diverged checkout is logged once and left alone.
- fast-forwards in place, without a restart, when the new commits only touch `ios/`, `docs/` or `*.md`.
- otherwise waits until `HEAD` is the last good commit, so there's always one to roll back to (unless `HEAD` is crash-looping, so a fix can still get through). Then it checks the new commit in a staging worktree (`/Volumes/TinkerSSD/effect-sim-staging` when that disk exists, else `../effect-sim-staging`): `bun install --frozen-lockfile`, `bun run typecheck`, and `bun run hwir <args> --smoke`, which goes through `package.json` and the new commit's own supervisor. If they all pass it fast-forwards, stops the runtime and exits, and launchd starts it again on the new code (installing its dependencies first).
- never retries a commit that failed the check. A newer commit is checked fresh.

Once the runtime has run for 5 minutes without exiting, the commit it started on becomes the last good one. If the runtime then crashes 3 times within 10 minutes on a newer commit, the supervisor runs `git reset --hard <lastGood>`, marks the bad commit so it's never retried, and exits for launchd to restart it.

What it remembers lives in `.hwir-supervisor.json` (git-ignored):

```json
{ "lastGood": "<sha>", "failed": { "<sha>": "typecheck" } }
```

Delete a sha from `failed` to let it be tried again. If the file can't be written, the supervisor keeps what it knows in memory, stays running rather than restarting, and applies no updates until the file is writable again.

With `--smoke` the supervisor does its normal startup (state, git, dependencies), runs the runtime once with `--smoke`, and exits with its code. It never updates or writes state.

Every decision is one `[SUPERVISOR]` line in launchd's log (`logs/hwir.log`). The minute-by-minute check only logs when its answer changes.

For testing, these environment variables shorten the timings: `HWIR_FIRST_CHECK_MS` (10 s), `HWIR_UPDATE_INTERVAL_MS` (60 s), `HWIR_STABLE_MS` (5 min), `HWIR_CRASH_LIMIT` (3), `HWIR_CRASH_WINDOW_MS` (10 min). `HWIR_STAGING_DIR` and `HWIR_SUPERVISOR_STATE` move the staging worktree and state file.

### macOS launchd setup

- `launchd` (via com.mikecann.effect-sim.hwir.plist) runs `bun run hwir` with `KeepAlive`, so it restarts the supervisor whenever it exits, including after an update or rollback.
- The supervisor finds bun through its own executable path and git in `PATH` or the usual places, as launchd's `PATH` is minimal.
- If the supervisor dies without stopping the runtime, the runtime notices and exits, so there are never two runtimes driving the lights.
