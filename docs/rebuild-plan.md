# effect-sim rebuild plan (Nov 2026)

Mike picked the full rebuild on 18 Nov 2026 (Threadbear thread a008b0d1). This is the shared design every piece of the work follows. It's a working document: update it when a decision changes.

## Ground rules (the display is live)

- HWIR on Tinker Desk (`ssh tinker-desk`, checkout `~/dev/code/effect-sim`, launchd daemon `/Library/LaunchDaemons/com.mikecann.effect-sim.hwir.plist`, which runs `bun run hwir --project jh7evn9abjw0qyv96xvzk21nd97w8cjw --playlist j9783dawqvnmgzvhkem1ckzp4s7yek94`) pulls `main` and restarts. **Anything on main is on the lights within a minute.** We can't edit the plist (no sudo), only what `bun run hwir` runs.
- Production Convex is `aromatic-cardinal-985` (HWIR, the editor and the Lights iPhone app). Nobody deploys to it until the cutover. Develop against a local backend (`convex dev --local`), or the dev deployment `expert-viper-771` only after checking with the coordinator.
- Backup of production taken before any change: `~/dev/me/misc/xmas-lights/convex-backups/prod-2026-11-18-pre-rebuild.zip` (about 100 KB: 1 project, 40 nodes, 23 sequences, 2 playlists). Import it into your local backend for real data: `npx convex import --replace-all <zip>`.
- Work on branches off `rebuild`, never push to `main`. On the M5, prefix builds, typechecks, lint and tests with `taskpolicy -b`, and run one at a time. Anything that needs real hardware or long runs goes on Tinker Desk, in a separate checkout under `/Volumes/TinkerSSD/`, never in `~/dev/code/effect-sim`.
- A test HWIR on Tinker Desk must run with `--dry-run` (no UDP to strings, no Convex mutations, no Home Assistant), so it can't fight the live one.

## Phases

0. **Safe updates for HWIR** (lands on main first, on its own). A small supervisor (`bun run hwir` starts it) owns updates. It fast-forwards only, checks each new commit in a staging checkout (install, typecheck, a `--smoke` boot) before switching, skips commits that only touch `ios/`, `docs/` or markdown, keeps a last-good commit and rolls back to it if the runtime crash-loops after an update. It never re-applies a commit that failed.
1. **Foundation**: upgrade every dependency to current majors, `mikecann-lint init --baseline`, GitHub Actions CI (typecheck, lint, test), move test-only packages to devDependencies, `bun audit` clean.
2. **Data and auth**: the new data model below, one atomic sync mutation, role tokens, state machines, migration, convex-test coverage.
3. **Runtime, editor, mapping** (in parallel): HWIR robustness and status, editor tools and effect API, camera mapping tooling.
4. **Cutover**: back up again, deploy Convex, migrate, merge to main, reinstall the iPhone app, watch the display at sunset.

## Data model

- **Client keys.** Every editor-owned row (`nodes`, `sequences`, `playlists`) gets `key: v.string()`, indexed `by_project_key`. New rows get `crypto.randomUUID()` on the client. Migrated rows use their current `_id` string as the key, so existing references stay valid without rewriting. All cross-row references (`parentId`, `segments[].nodeId`, `appliesTo.nodeIds`, `sequenceIds`, display mode ids) hold keys, not Convex ids. No more temp ids or id swapping.
- **One sync mutation** `editor.sync({ projectId, token, changes: [{ table, op: "upsert" | "delete", key, doc? }] })`, atomic across tables, each doc validated against its table's validator (no `v.any()` except effect props, which are validated with the effect's zod schema from `shared/`). A delete that leaves dangling references is cleaned up in the same mutation (children re-parented to the deleted folder's parent, segments and `appliesTo` entries dropped, playlist entries removed). A change to a row that no longer exists is skipped and reported back, never fails the batch.
- **Mapped strings.** String nodes keep `pathPoints` (for hand-drawn strings) and gain optional `ledPositions: {x,y,z}[]`, one per LED, from the camera mapping. When present the editor and effects use them as-is, without resampling. Virtual-string segments are validated against `ledCount`.
- **Projects** stay keyed by Convex `_id` (they aren't created by the sync).

## Auth

Three role tokens, Convex env vars `EDITOR_TOKEN`, `HWIR_TOKEN`, `REMOTE_TOKEN`. Every mutation takes `token` and checks it through custom functions (convex-helpers `customMutation`), and the state machines' `callers` check the role. Queries stay public (nothing secret is in the data). The editor asks for its token once and keeps it in localStorage, HWIR reads it from `.env.local`, the iPhone app gets it from a git-ignored xcconfig. Rollout is widen then switch: accept a missing token while clients update, then require it.

## State machines (`@convex-dev/state-machines`, a `description` on every state and transition)

- `displayControl` (exists): add a `mapping` mode alongside playlist and sequence.
- `hwirPresence`, one row per project: `online → stale → offline`, driven by HWIR's heartbeat (every 10 s) and timers. The row also carries the commit HWIR runs, frame rate, and each string's state, so the phone and editor can show which strings are up.
- `mappingSession`: `capturing → solving → review → applied | discarded`. While capturing, HWIR lights the pattern the session asks for and confirms each frame (`shownSeq`) once it's gone out over UDP, so a camera knows when to take its photo. `applied` keeps the previous positions for rollback.
- `switch` nodes (`isOn: boolean | null` today): `unknown → switching → on | off | unreachable`.

Outside Convex, lifecycles are explicit state types with their moves in one place: each HWIR string connection (`connecting → live → degraded → offline`), the editor's tool (`select | measure | placing | mapping`), and the supervisor's update cycle.

## Effects

Effects stay React components (shared by the simulator and HWIR), but:
- A `defineEffect({ id, props, defaults, render })` helper replaces the four edits in `stringEffectDefinitions.ts`, with typed props.
- The string API gains `getPosition(i)` and normalised house `bounds`, from shared geometry code (moved out of `src/simulator` into `shared/`), so spatial effects work on the real lights too.
- A seeded random number generator on the effect context replaces `Math.random`, so scrubbing and the real lights match.
- The inspector's effect preview works again.
