# Working on effect-sim

Read [README.md](README.md) first for what the parts are and how to run them. This file is the rules for changing the code.

## The display is live

- HWIR on Tinker Desk follows `main`. Its supervisor fetches every minute, checks a new commit (install, typecheck, a `--smoke` boot) and switches the lights to it, so anything merged to `main` is on the house within about a minute. The gate only catches code that fails to build or boot. It can't tell that an effect looks wrong or a plug switches at the wrong time.
- Never push untested code to `main`. Work on a branch and merge only once it has passed the checks below and been tried against a local backend.
- Never deploy to production Convex (`aromatic-cardinal-985`) without Mike's OK. HWIR, the editor and the phone app all use it.
- Develop against a local backend (`npx convex deployment create local --select`, then `bun run dev`). For real data, import a backup with `npx convex import --replace-all <zip>`.
- Any HWIR you start on a machine near the lights runs with `--dry-run`, or it will fight the live runtime over the strings and the plug. `--dry-run --local-convex-writes` lets mutations through to a local backend only.
- Don't edit `~/dev/code/effect-sim` on Tinker Desk. That's the live checkout. Test checkouts there go under `/Volumes/TinkerSSD/`.

## Side effects

Every call that reaches out and changes something real (UDP to the strings, WLED's JSON API, smart plug HTTP, Home Assistant, Convex mutations from HWIR) goes through `reachOut` in `shared/outsideWorld.ts`. That's what `--dry-run` and `--smoke` switch off. A new outward call that skips it will run during a smoke test and a dry run, so route it through there and add a case to `shared/outsideWorld.test.ts` if it's a new kind.

## Before you push

```bash
bun run typecheck
bun run lint
bun run test
```

CI runs the same three. Use `bun run test`, not `bun test`. On Mike's M5 prefix them with `taskpolicy -b` and run one at a time.

Lint is mikecann-lint plus `eslint-rules/`. Existing problems are baselined in `eslint-suppressions.json`. Don't add to it, and don't add `eslint-disable` comments: fix the cause. When you fix a baselined problem, prune the file with `bunx eslint . --prune-suppressions`.

## State machines

Any row that moves through steps runs on `@convex-dev/state-machines` (vendored in `vendor/`). The machines are `displayControl`, `hwirPresence`, `mappingSession` and `switchState`, each in its own `convex/*.ts` file and listed in `convex/machines.ts`.

- Every state and every transition has a `description`. The `/machines` page in the editor shows them.
- Change a machine's state only through its transitions, using the catalog's builders. Public mutations use the role builders in `convex/auth.ts`, which check the token first.
- Outside Convex, write a lifecycle as an explicit state type with all its moves in one function: HWIR's string connection (`hardware-interface-runtime/strings/connection.ts`), the editor's tool (`src/common/models/editorTool.ts`) and the supervisor's update cycle are the examples. No loose flags.

## Data model

- `nodes`, `sequences` and `playlists` rows have a client-made `key` (`crypto.randomUUID()`). Every reference between rows (`parentId`, `segments[].nodeId`, `appliesTo.nodeIds`, `sequenceIds`, the display mode's `id`) holds keys, not Convex ids. Rows migrated from before keys use their old `_id` string as the key. Projects stay keyed by `_id`.
- The editor saves through one mutation, `editor.sync`, which applies a batch of `create | update | delete` changes atomically. A row that breaks a rule is rejected on its own and the rest applies. Deletes repair dangling references in the same mutation. `LIMITS` in `convex/editorSync.ts` caps row sizes and counts.
- On the client, `src/common/models/sync/ProjectSyncModel.ts` owns saving. The MobX models are the truth while editing.
- Every mutation takes a role `token` (`EDITOR_TOKEN`, `HWIR_TOKEN`, `REMOTE_TOKEN`, checked in `convex/roles.ts`), except that the web editor signs in with Google instead (`convex/editors.ts`) and counts as the editor role. Queries are public, apart from `mapping.views` (photos of the house). Build new mutations with `editorMutation`, `hwirMutation`, `remoteMutation` or `roleMutation(...)` from `convex/auth.ts`.
- Schema changes to production go widen then switch (see "Cutover" in `docs/rebuild-plan.md`), because production rows must keep working while clients update.

## Effects

- One file per effect in `shared/effects/string/` or `switch/`, made with `defineEffect`, plus one line in `shared/effects/registry.ts`. An effect's `id` is stored on events, so never rename one that's been used.
- Effects are deterministic. Use the seeded `random` from `useEffectFrame` or `useEffectRandom()`, never `Math.random` or the clock, so the editor and the lights draw the same frames however the playhead got there.
- Number props need bounds (`inspectableProps.bounded`), as Convex validates props against the same zod schema and a runaway value can stall HWIR.

## Code style

- Bun is the package manager. Don't run `npm` for installs.
- UI is Mantine. Inline event handlers in JSX unless they're reused (the local `no-hoisted-single-use-handlers` rule enforces this), and keep handlers in the component that uses them rather than passing callbacks down.
- Don't add props a parent never sets. Make the value a constant.
- When you split a big component, put the pieces in their own folder.
- Every click shows something at once: an optimistic change, or a spinner with the control disabled until the work lands.

## Where docs live

- `README.md`: the overview, running locally and deployments.
- `docs/rebuild-plan.md`: the design and the decisions behind the November 2026 rebuild. Update it when a decision changes.
- `hardware-interface-runtime/README.md`: HWIR's flags, internals and the supervisor.
- `tools/mapping/README.md`: the camera mapping runbook.
- `eslint-rules/README.md`: this repo's own lint rules.
