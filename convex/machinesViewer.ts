import { viewerArgs } from "@convex-dev/state-machines";
import { query } from "./_generated/server";
import { machines } from "./machines";

// What the editor's admin Machines page (/machines) reads: every state machine
// with live counts, and each row's state and history. Read-only: there's no
// `send`, so nothing here moves a row. effect-sim has no sign-in, so like the
// rest of this deployment it's open to anyone with the URL.
const viewer = machines.viewer({ read: async () => true });

export const overview = query({
  args: viewerArgs.overview,
  handler: viewer.overview,
});
export const counts = query({
  args: viewerArgs.counts,
  handler: viewer.counts,
});
export const rows = query({ args: viewerArgs.rows, handler: viewer.rows });
export const row = query({ args: viewerArgs.row, handler: viewer.row });
