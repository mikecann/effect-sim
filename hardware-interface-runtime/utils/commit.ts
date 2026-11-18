import { execSync } from "node:child_process";

/** The git commit this checkout runs, for the heartbeat (or "unknown"). */
export const readCommit = (): string => {
  try {
    return execSync("git rev-parse --short=12 HEAD", {
      cwd: import.meta.dirname,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
};
