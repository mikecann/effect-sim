# Hardware Interface Runtime

HWIR drives the real lights: it plays the display's playlist (or sequence) on the WLED strings over DDP, follows the phone remote and Home Assistant's plug, shows camera mapping patterns, and reports how it's doing to Convex.

## Running

```bash
# Prompts for a project and playlist
bun run hwir

# Skips the prompts. A playlist of 'null' is listen mode (below)
bun run hwir -p <projectId> -l <playlistId>

# Everything runs, but shared/outsideWorld.ts blocks UDP, WLED and smart plug
# calls, Convex mutations and Home Assistant: safe beside the live runtime.
# With no network every string goes connecting -> offline.
bun run hwir -p <projectId> -l <playlistId> --dry-run

# A dry run that lets Convex mutations through to a local backend only
# (refused for a cloud URL): for testing the heartbeat, confirmations and
# mapping acks without touching the lights
bun run hwir -p <projectId> -l <playlistId> --dry-run --local-convex-writes

# Boot, load the project, run ~2 s of frames with no side effects, exit 0
# (non-zero on any error, or after HWIR_SMOKE_TIMEOUT_MS, default 60 s)
bun hardware-interface-runtime/index.tsx -p <projectId> -l <playlistId> --smoke
```

## How it works

- `index.tsx` parses the flags (`cli.ts`, `runMode.ts`), wraps the Convex client so every mutation goes through the outside-world guard, and renders `App.tsx` with react-nil.
- **Frames** (`frames/`): `HwirFrameProvider` runs frames on the project's frame interval (`defaultFramerate`, 40 fps by default), with `FrameClock` catching up at most 2 frames after a stall and dropping the rest. `FpsMeter` measures the rate really achieved, which the heartbeat reports.
- **Strings** (`strings/`): `String.tsx` keeps one `StringLink` per string, remade only when its address changes. Each link's connection is an explicit state (`strings/connection.ts`, all moves in `stepConnection`): `connecting` (probing every 2 s) goes `live` on a good `/json/info` probe, or `offline` after 3 failed ones; `live` (probed every 10 s) goes `degraded` on a DDP send error or failed probe; `degraded` (every 2 s) goes back to `live` on a good probe, or `offline` after 3 failures; `offline` probes at 5 s backing off to a minute, and goes straight to `live` when the board answers. Frames go only to `live` and `degraded` strings. Whenever a string becomes live (and when its board's uptime shows it restarted), the link puts WLED's on-state and the string's brightness back. Each change of state is one log line, never one per frame or per retry.
- **DDP** (`strings/ddp.ts`): frames over 480 LEDs go out in 1440-byte chunks with their byte offsets, PUSH only on the last, in buffers reused frame to frame. A frame is dropped for a string whose last one is still going out.
- **Playback**: `HeadlessPlaylistPlayer` plays the display's mode with `HeadlessPlayerModel`, which reads the playlist's sequences fresh each frame, so edits in the editor (sequences added, removed, reordered, a first sequence in an empty playlist) take effect without a mode change. `HeadlessLedDataDispatcher` sends each frame, scaled by the display's brightness (black when off; WLED goes back to its own effect a few seconds after DDP stops). A string's own brightness is WLED's `bri`.
- **Mapping mode** (`mapping/`): when the display's mode is `mapping` (convex/displayControl.ts), `MappingDisplay` follows the session's `request` (`{seq, pattern}`, convex/mapping.ts `get`) and lights it in full white at the display's brightness, with the LED codes from `shared/mapping/ledCodes.ts` (every `string` node, in key order). Once a frame with that seq has gone out over UDP to every live string, it acks `mapping.shown`. Strings that aren't live don't hold the ack up (a live one whose sends fail stops holding it after 10 frames), so a pattern is acked even with no strings live; HWIR logs which strings missed each pattern. `mapping.shown` takes only the seq, so the camera tool learns which strings are offline from `hwir:presence`, not from the ack.
- **Listen mode** (no playlist): `ClientDataSocket` takes frames from the editor on the same Mac (`ws://127.0.0.1:8787`, `BUN_WS_PORT`) and forwards them to the strings. It listens on localhost only, refuses pages from other origins, and requires `?token=` when `HWIR_WS_TOKEN` is set.

## Token, heartbeat and the remote

Every Convex mutation HWIR sends carries `HWIR_TOKEN`, read from `.env.local` (the same value as the deployment's `HWIR_TOKEN` env var, see `convex/roles.ts`). Without it, mutations work only until the deployment sets `REQUIRE_TOKENS=true`.

Every 10 s HWIR sends a heartbeat (`hwir:heartbeat`), which keeps the `hwirPresence` machine online and carries the commit, the measured frame rate, each string's connection state and when it last answered a probe, and the plug's state. `--dry-run` and `--smoke` send none of these (unless `--local-convex-writes`).

`hooks.ts` follows the phone remote (`display.get`) and confirms each change with `display.applied` once a frame drawn for it has been sent (black when off; `RenderStamp` marks when the new player's effects have drawn). The confirmation means HWIR is showing the change, not that every string got it: it's sent even when no strings are live or every send failed, as the phone shows string health from `hwir:presence`. With Home Assistant set up (`HA_URL`, `HA_TOKEN`, `HA_PLUG_ENTITY` in `.env.local`) the plug is switched first (one call at a time, always ending on the latest request), but a failure doesn't hold the confirmation up. The plug is the truth for on/off, so `display/plug.ts` never retries ON: a late ON could land after the 10pm automation found the plug already off and leave the lights on all night. A failed ON is reported in the heartbeat's `plug`, the plug check below makes the display follow Home Assistant (the phone shows off, and the person can tap again). A failed OFF, the safe direction, retries with backoff (2, 5, 15, 30, 45 s, about two minutes), stopping early if the plug reaches off or Home Assistant switches it meanwhile; then it's reported the same way. Every 10 s, in every display state, a check (`followPlug`) re-sends a confirmation that was lost while the display is still `applying` or `unreachable`, and when it's `live` and Home Assistant switched the plug (sunset on, 10pm off) moves on/off to match.

## Supervisor and updates

`bun run hwir` runs `supervisor.ts`, which runs the runtime (`index.tsx`, with the same arguments) as a child and restarts it with backoff (1 s doubling to 30 s) whenever it exits. The supervisor only uses Node built-ins, so it keeps working when the rest of the repo is broken.

Before each start it checks that `node_modules` matches `bun.lock` and `package.json` (a hash stamped in `node_modules/.hwir-lock-stamp` after an install works) and runs `bun install --frozen-lockfile` if not. A failed install is retried before the next start.

With `HWIR_AUTO_UPDATE=true` (in `.env.local`) it also keeps the checkout on `origin/main`. Every minute it runs `git fetch origin main` and:

- does nothing unless `origin/main` is strictly ahead of `HEAD` (fast-forward only). A dirty, detached, ahead or diverged checkout is logged once and left alone.
- fast-forwards in place, without a restart, when the new commits only touch `ios/`, `docs/` or `*.md`.
- otherwise waits until `HEAD` is the last good commit, so there's always one to roll back to (unless `HEAD` is crash-looping, so a fix can still get through). Then it checks the new commit in a staging worktree (`../effect-sim-staging`, next to the repo, or `HWIR_STAGING_DIR`; never an external disk, because the launchd daemon can't reach removable volumes and a checkout there hangs). It first checks it can write there, within 15 s. It refuses a staging folder that is, holds or sits inside the live repo, and only ever deletes one that's empty or is this repo's own worktree. If the staging folder can't be used, that's the machine's fault, not the commit's, so it logs why once and tries again at the next check instead of marking the commit failed. A checkout that fails 3 checks in a row is blamed on the commit: `bun install --frozen-lockfile`, `bun run typecheck`, and `bun run hwir <args> --smoke`, which goes through `package.json` and the new commit's own supervisor. If they all pass it fast-forwards, stops the runtime and exits, and launchd starts it again on the new code (installing its dependencies first).
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
