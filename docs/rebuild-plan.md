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

### Decisions made building it (Phase 2, branch `rebuild-data`)

- **Reference fields keep their names.** `parentId`, `segments[].nodeId`, `appliesTo.nodeIds`, `sequenceIds` and the display mode's `id` hold keys now but weren't renamed: migrated rows' keys are their old `_id` strings, so the migration rewrites no references, and the phone app's `{kind, id}` mode shape still works.
- **`create | update | delete`, not `upsert`.** The editor knows whether the server has confirmed a row, so it says which. An `update` (or `delete`) of a row that's gone is skipped and reported, so a stale edit can't bring a deleted row back. A `create` of a key that exists updates it, so a retried batch is harmless. The project's own name and settings ride along as `{ table: "projects", op: "update", doc }`; creating and deleting a project are their own mutations (`editor.createProject`, `editor.deleteProject`).
- **Rule breaks are rejected per row, not per batch.** A row that breaks a rule (a segment past its string's last LED, effect props of the wrong type, an unknown effect, `ledPositions` that don't match `ledCount`, a folder inside itself) is left as the server has it and reported in `rejected`; the rest of the batch applies. A doc that doesn't match the table's Convex validator still fails the whole call, as that's a client bug.
- **Effect props** are checked with the effect's zod schema made `.partial()`: missing fields are fine (the effect's defaults fill them, as the runtime always did), and fields left behind when an event's effect was changed are kept. Production has both, so a strict check would refuse rows the editor already shows.
- **Repairs.** Deleting a folder moves its children to the folder's parent (or further up if that's going too); the editor does the same locally so the tree never shows orphans. A string that gets shorter trims the segments that ran past its end (segments the batch itself sent are rejected instead). Missing `appliesTo` and playlist entries are dropped.
- **Indexes.** `by_project` stays beside `by_project_key`: it lists rows in the order they were made, which the editor and phone show. `by_kind`, `by_parent` and `by_kind_project` were unused and went.
- **Editor sync** (`src/common/models/sync/ProjectSyncModel.ts`): the MobX models are the truth while editing; a base copy of each row as the server last confirmed it says what's unsaved. Batches go 500 ms after the last edit, never two at once; server updates replace rows with no unsaved edits; skipped and rejected rows go back to the server's version with a notification; a failed batch retries at 2, 5, 15 then 30 s. Hiding or closing the page sends what's left, and a close with edits still unsaved asks first. The menu bar shows Loading / Saving / Saved / Not saved (with Retry now).
- **Lost-update risk, accepted.** An update sends the whole row. If the server changed a row (a mapping session applying `ledPositions`) while the editor has an unsaved edit to the same row, the editor's version wins. One person edits at a time, so this is rare; field-level patches would fix it if it bites.

## Auth

Three role tokens, Convex env vars `EDITOR_TOKEN`, `HWIR_TOKEN`, `REMOTE_TOKEN`. Every mutation takes `token` and checks it through custom functions (convex-helpers `customMutation`), and the state machines' `callers` check the role. Queries stay public (nothing secret is in the data). The editor asks for its token once and keeps it in localStorage, HWIR reads it from `.env.local`, the iPhone app gets it from a git-ignored xcconfig. Rollout is widen then switch: accept a missing token while clients update, then require it.

How it's built: `convex/roles.ts` checks a token against the roles a function allows (constant-time compare). A wrong token is always refused, and so is any token whose env var isn't set; a missing one is accepted with a `console.warn` until `REQUIRE_TOKENS` is `"true"`, and then counts as the function's first role. `convex/auth.ts` has the builders (`editorMutation`, `hwirMutation`, `remoteMutation`, `roleMutation(...roles)`), on top of the state machine catalog's builder. The machines' `callers` only get `{ db, auth }`, so the builder puts the role on `ctx.auth` as the caller's identity (`issuer: "effect-sim-token"`, `subject: role`) and the callers check it with `isRole`. The Machines viewer and every query stay public. The editor's token modal checks a token with `editor.checkToken` before keeping it, and asks again if the server ever refuses it. The phone app's token comes from `ios/Secrets.xcconfig` (copy `Secrets.example.xcconfig`) through `ios/Lights.xcconfig`, each target's Info.plist (`LightsRemoteToken`) and `Config.remoteToken`.

## State machines (`@convex-dev/state-machines`, a `description` on every state and transition)

- `displayControl` (exists): add a `mapping` mode alongside playlist and sequence.
- `hwirPresence`, one row per project: `online → stale → offline`, driven by HWIR's heartbeat (every 10 s) and timers. The row also carries the commit HWIR runs, frame rate, and each string's state, so the phone and editor can show which strings are up.
- `mappingSession`: `capturing → solving → review → applied | discarded`. While capturing, HWIR lights the pattern the session asks for and confirms each frame (`shownSeq`) once it's gone out over UDP, so a camera knows when to take its photo. `applied` keeps the previous positions for rollback.
- `switch` nodes (`isOn: boolean | null` today): `unknown → switching → on | off | unreachable`.

As built (`convex/*.ts`, all on the admin /machines page):
- `displayControl`: the editor sends `MAP {sessionId}` (role `mapper`, the editor token) when a session starts; the mode becomes `{ kind: "mapping", id, returnTo }`. The session sends `MAPPING_ENDED` when it leaves capturing (captured, discarded or abandoned), which goes back to `returnTo` if the display is still showing that session. HWIR confirms both with `APPLIED`, like any change. The phone can still pick a mode during mapping, which ends it on the lights. Until Phase 3, HWIR shows black in mapping mode.
- `hwirPresence` (`hwirPresences`, `convex/hwir.ts`): `online` (timer at `staleAt`, 30 s after the last heartbeat) → `stale` (timer at `offlineAt`, 2 min after) → `offline`; any heartbeat goes back to `online`. `commit`, `fps` and `strings: [{ key, connection }]` are plain fields beside the state, patched on every heartbeat. History is off (a step every 10 s).
- `mappingSession` (`mappingSessions`, `convex/mapping.ts`): `capturing { request: { seq, pattern }, shownSeq, expiresAt }` takes `SHOW` (the editor, `seq + 1`) and `SHOWN { seq }` (HWIR, guarded to the current seq); `CAPTURED → solving`, `SOLVED { proposed } → review`, `APPLY → applied { previous }` (writes `ledPositions`, skipping strings that are gone or whose LED count changed), `ROLLBACK → discarded` (puts `previous` back), `RECAPTURE` from solving or review, `DISCARD`, and `ABANDONED` after 10 idle minutes. One active session per project. Patterns: `off`, `all`, `string`, `led`, `bit` (a starting set for Phase 3).
- `switchState` (`switchStates`, keyed by the switch node's key, `convex/switches.ts`): `start —ADD→ unknown`; `SWITCH → switching` (10 s timer → `unreachable`); `TURNED { on } → on | off`; `FAILED → unreachable`; `REMOVE → removed`, then purged. `editor.sync` adds and removes the rows as switches come and go. HWIR and the editor report whenever they really call a plug (not in dry runs or the editor's dev mode). History is off.

Outside Convex, lifecycles are explicit state types with their moves in one place: each HWIR string connection (`connecting → live → degraded → offline`), the editor's tool (`select | measure | placing | mapping`), and the supervisor's update cycle.

## Effects

Effects stay React components (shared by the simulator and HWIR), but:
- A `defineEffect({ id, props, defaults, render })` helper replaces the four edits in `stringEffectDefinitions.ts`, with typed props.
- The string API gains `getPosition(i)` and normalised house `bounds`, from shared geometry code (moved out of `src/simulator` into `shared/`), so spatial effects work on the real lights too.
- A seeded random number generator on the effect context replaces `Math.random`, so scrubbing and the real lights match.
- The inspector's effect preview works again.

## Cutover (Phase 4 steps for Phase 2's data changes)

Production can't take the new schema straight away (its rows have no keys), so the schema goes in twice. Commit `61f7217` ("Widen the schema and add the key migration") has the old functions with the new fields optional and the migration.

1. **Back up** production again (`npx convex export --prod`).
2. **Set the tokens** on production: `EDITOR_TOKEN`, `HWIR_TOKEN`, `REMOTE_TOKEN` (random, e.g. `openssl rand -hex 24`). `REQUIRE_TOKENS` stays unset.
3. **Deploy the widened schema**: check out `61f7217` and `npx convex deploy`. Today's editor, HWIR and phone app keep working on it.
4. **Run the migration**: `npx convex run --prod migrations:run`, then `npx convex run --prod migrations:check` until `problems` is empty. Proven on the 18 Nov backup: 40 nodes, 23 sequences and 2 playlists keyed, 3 folders' `children` dropped, 6 switches' `isOn` moved to `switchStates`, 0 references repaired, 341 references resolving, every sequence's effect props passing; a second run changes nothing.
5. **Deploy `rebuild-data`'s functions** (`npx convex deploy` from the branch head, after a last `migrations:run` for rows made since step 4). HWIR still running `main` keeps working: `getProject`, `getDataForProject`, `listProjects` and `listPlaylistsForProject` keep their names and shapes, keys equal the old ids, and its token-less mutations are accepted. The old editor's `applyOperations` is gone, so don't edit until step 6.
6. **Give HWIR its token**: add `HWIR_TOKEN=...` to `~/dev/code/effect-sim/.env.local` on Tinker Desk (git-ignored, so the supervisor's pulls keep it).
7. **Merge to `main`.** The supervisor smoke-tests the commit and switches HWIR to it; check `hwir:presence` goes `online` with the new commit, and redeploy the editor.
8. **Reinstall the Lights app** with `ios/Secrets.xcconfig` holding `LIGHTS_REMOTE_TOKEN` (`ios/scripts/install-phone.sh`).
9. **Open the editor** and paste `EDITOR_TOKEN` into its token modal.
10. **Require tokens**: once the Convex logs stop showing "came without a token" warnings, set `REQUIRE_TOKENS=true`.

## Mapping (Phase 3)

- LED codes are defined once in `shared/mapping/ledCodes.ts`: strings in key order, LEDs in index order, codes from 1. HWIR renders patterns with `isLit`, and the capture tool decodes with `ledOfCode`. Neither side defines its own scheme.
- The capture flow: start a mapping session (the display switches to mapping mode), take a dark frame and an all-on frame, then for each bit a normal and an inverted frame, waiting for HWIR's `shownSeq` ack before each photo. Decode each pixel cluster's code from the bit pairs, which gives every LED a 2D point (u, v in 0..1 image space) with a confidence. Use single-LED and single-string patterns to check and fill gaps.
- 2D to 3D happens in the editor: the session's photo is overlaid on the 3D view, the camera is lined up with it (by hand or from a few picked correspondences), and each 2D point is raycast onto the house mesh with the existing placer raycast. The result is proposed for review (`mappingSession` review state), then applied as `ledPositions`.
- Virtual strings (Top Stairs, Spirals, Flowers...) are redrawn in the editor afterwards, by selecting LED ranges on the mapped strings.
