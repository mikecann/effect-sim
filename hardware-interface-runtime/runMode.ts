/**
 * How this run treats the outside world:
 * - live: drives the lights, confirms the remote's changes, switches the plug.
 * - dry-run (--dry-run): everything else runs, but no UDP or WLED calls, no
 *   Convex mutations and no Home Assistant, so a test copy can run beside the
 *   live one.
 * - smoke (--smoke): a dry run that exits 0 after about two seconds of frames,
 *   or non-zero on any error. The supervisor runs it to check a new commit.
 */
export type RunMode = "live" | "dry-run" | "smoke";

const args = process.argv.slice(2);

export const runMode: RunMode = args.includes("--smoke")
  ? "smoke"
  : args.includes("--dry-run")
    ? "dry-run"
    : "live";

/** Only a live run talks to the strings, Convex mutations or Home Assistant. */
export const isLive = runMode === "live";
