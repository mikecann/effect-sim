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

/**
 * --local-convex-writes, only with --dry-run: Convex mutations go through
 * (heartbeat, display confirmations, mapping acks) while UDP, WLED and Home
 * Assistant stay blocked. Refused unless the backend is a local one, so a
 * dry run can never write to a cloud deployment.
 */
export const convexWritesAllowed = (convexUrl: string): boolean => {
  if (!args.includes("--local-convex-writes")) return false;
  if (runMode !== "dry-run")
    throw new Error("--local-convex-writes only works with --dry-run");
  const host = new URL(convexUrl).hostname;
  const local =
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^(10|192\.168)\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (!local)
    throw new Error(
      `--local-convex-writes needs a local Convex backend, not ${convexUrl}`,
    );
  console.log(`dry-run: Convex mutations go to the local backend ${convexUrl}`);
  return true;
};
