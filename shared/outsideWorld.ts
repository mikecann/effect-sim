/**
 * The one switch for everything that reaches out and changes something real:
 * UDP to the strings, WLED's JSON API, smart plug HTTP, Convex mutations and
 * Home Assistant. HWIR's --dry-run and --smoke turn it off, so a test run
 * can't touch the display, the plugs or production data.
 */
let blockedBy: string | null = null;
const reported = new Set<string>();

/** Blocks every outward side effect, naming why in the log, or allows them again with null. */
export const blockOutsideWorld = (reason: string | null) => {
  blockedBy = reason;
  reported.clear();
};

export const outsideWorldBlocked = () => blockedBy !== null;

/** Runs `act` unless blocked. When blocked, says so once per `what` and returns `fallback`. */
export const reachOut = <T>(what: string, act: () => T, fallback: T): T => {
  if (blockedBy === null) return act();
  if (!reported.has(what)) {
    reported.add(what);
    console.log(`${blockedBy}: not ${what}`);
  }
  return fallback;
};
