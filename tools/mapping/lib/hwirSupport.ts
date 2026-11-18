import { spawnSync } from "node:child_process";

// The commit that taught HWIR the `ranges` mapping pattern. An HWIR older
// than this (behind on main, or rolled back by its supervisor) doesn't know
// the pattern and lights every LED for it while still acking, so the block
// fill would place garbage. Checked against HWIR's heartbeat commit.
export const RANGES_COMMIT = "fbd450e";

const git = (args: string[], cwd: string) =>
  spawnSync("git", args, { cwd, encoding: "utf8" });

/** Whether the HWIR at `commit` renders `ranges`, from this checkout's git. */
export const hwirSupportsRanges = (
  commit: string | undefined,
  cwd: string,
): { ok: true } | { ok: false; why: string } => {
  if (!commit) return { ok: false, why: "HWIR hasn't reported its commit." };
  const known = () => git(["cat-file", "-e", `${commit}^{commit}`], cwd).status === 0;
  if (!known()) git(["fetch", "--quiet", "origin"], cwd);
  if (!known())
    return {
      ok: false,
      why: `HWIR runs ${commit.slice(0, 7)}, which this checkout doesn't know (fetch origin, or HWIR runs uncommitted code).`,
    };
  const res = git(["merge-base", "--is-ancestor", RANGES_COMMIT, commit], cwd);
  return res.status === 0
    ? { ok: true }
    : {
        ok: false,
        why: `HWIR runs ${commit.slice(0, 7)}, from before block patterns (${RANGES_COMMIT}). It would light every LED for a block. Wait for it to pick up main.`,
      };
};
