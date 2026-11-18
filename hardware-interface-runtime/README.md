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

# Everything runs, but no UDP or WLED calls, no Convex mutations and no
# Home Assistant: safe to run beside the live runtime
bun run hwir -p <projectId> -l <playlistId> --dry-run

# Boot, load the project, run ~2 s of frames with no side effects, exit 0
# (non-zero on any error, or after HWIR_SMOKE_TIMEOUT_MS, default 60 s)
bun hardware-interface-runtime/index.tsx -p <projectId> -l <playlistId> --smoke
```

## Supervisor and updates

`bun run hwir` runs `supervisor.ts`, which runs the runtime (`index.tsx`, with the same arguments) as a child and restarts it with backoff (1 s doubling to 30 s) whenever it exits. The supervisor only uses Node built-ins, so it keeps working when the rest of the repo is broken.

With `HWIR_AUTO_UPDATE=true` (in `.env.local`) it also keeps the checkout on `origin/main`. Every minute it runs `git fetch origin main` and:

- does nothing unless `origin/main` is strictly ahead of `HEAD` (fast-forward only). A dirty, detached, ahead or diverged checkout is logged once and left alone.
- fast-forwards in place, without a restart, when the new commits only touch `ios/`, `docs/` or `*.md`.
- otherwise checks the new commit in a staging worktree next to the checkout (`../effect-sim-staging`): `bun install --frozen-lockfile`, `bun run typecheck`, `supervisor.ts --self-test` and an `index.tsx --smoke` boot. If they all pass it fast-forwards, runs `bun install`, stops the runtime and exits, and launchd starts it again on the new code.
- never retries a commit that failed the check. A newer commit is checked fresh.

Once the runtime has run for 5 minutes without exiting, its commit becomes the last good one. If the runtime then crashes 3 times within 10 minutes on a newer commit, the supervisor runs `git reset --hard <lastGood>`, marks the bad commit so it's never retried, runs `bun install` and exits for launchd to restart it.

What it remembers lives in `.hwir-supervisor.json` (git-ignored):

```json
{ "lastGood": "<sha>", "failed": { "<sha>": "typecheck" } }
```

Delete a sha from `failed` to let it be tried again.

Every decision is one `[SUPERVISOR]` line in launchd's log (`logs/hwir.log`). The minute-by-minute check only logs when its answer changes.

For testing, these environment variables shorten the timings: `HWIR_FIRST_CHECK_MS` (10 s), `HWIR_UPDATE_INTERVAL_MS` (60 s), `HWIR_STABLE_MS` (5 min), `HWIR_CRASH_LIMIT` (3), `HWIR_CRASH_WINDOW_MS` (10 min). `HWIR_STAGING_DIR` and `HWIR_SUPERVISOR_STATE` move the staging worktree and state file.

### macOS launchd setup

- `launchd` (via com.mikecann.effect-sim.hwir.plist) runs `bun run hwir` with `KeepAlive`, so it restarts the supervisor whenever it exits, including after an update or rollback.
- The supervisor finds bun through its own executable path and git in `PATH` or the usual places, as launchd's `PATH` is minimal.
- If the supervisor dies without stopping the runtime, the runtime notices and exits, so there are never two runtimes driving the lights.
