import { blockOutsideWorld } from "../shared/outsideWorld";

/**
 * How this run treats the outside world:
 * - live: drives the lights, confirms the remote's changes, switches the plugs.
 * - dry-run (--dry-run): everything else runs, but shared/outsideWorld blocks
 *   UDP, WLED and plug calls, Convex mutations and Home Assistant, so a test
 *   copy can run beside the live one.
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

if (runMode !== "live") blockOutsideWorld(runMode);
