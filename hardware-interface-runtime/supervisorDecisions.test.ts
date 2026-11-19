import { describe, expect, it } from "vitest";
import {
  backoffMs,
  decideAfterCrash,
  decideUpdate,
  gateFailureBlamesCommit,
  isDocsOnlyPath,
  markFailed,
  parseState,
  stagingDirFor,
  stagingDirProblem,
  type RepoFacts,
} from "./supervisorDecisions";

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);

const behind: RepoFacts = {
  head: A,
  origin: B,
  branch: "main",
  dirty: false,
  headIsAncestorOfOrigin: true,
  originIsAncestorOfHead: false,
  changedPaths: ["hardware-interface-runtime/index.tsx", "README.md"],
};

const noState = parseState(null);
const proven = { lastGood: A, failed: {} };
const ok = { headCrashLooping: false, stateWritable: true };

describe("decideUpdate", () => {
  it("does nothing when HEAD is origin/main", () => {
    const action = decideUpdate(
      {
        ...behind,
        origin: A,
        headIsAncestorOfOrigin: true,
        originIsAncestorOfHead: true,
        changedPaths: [],
      },
      proven,
      ok,
    );
    expect(action.kind).toBe("none");
  });

  it("gates a new commit that touches code", () => {
    expect(decideUpdate(behind, proven, ok)).toMatchObject({
      kind: "gate",
      sha: B,
    });
  });

  it("fast-forwards without a check when only ios/, docs/ or markdown change", () => {
    const action = decideUpdate(
      {
        ...behind,
        changedPaths: [
          "ios/Lights/App.swift",
          "docs/plan.md",
          "README.md",
          "shared/notes.md",
        ],
      },
      proven,
      ok,
    );
    expect(action).toMatchObject({ kind: "fast-forward", sha: B });
  });

  it("gates when a docs change comes with anything else", () => {
    const action = decideUpdate(
      { ...behind, changedPaths: ["docs/plan.md", "package.json"] },
      proven,
      ok,
    );
    expect(action.kind).toBe("gate");
  });

  it("gates when the diff is empty but the commit is new", () => {
    expect(decideUpdate({ ...behind, changedPaths: [] }, proven, ok).kind).toBe(
      "gate",
    );
  });

  it("is blocked when the checkout is dirty", () => {
    expect(decideUpdate({ ...behind, dirty: true }, proven, ok).kind).toBe(
      "blocked",
    );
  });

  it("is blocked when HEAD is detached", () => {
    expect(decideUpdate({ ...behind, branch: null }, proven, ok).kind).toBe(
      "blocked",
    );
  });

  it("is blocked when the checkout has diverged from origin/main", () => {
    const action = decideUpdate(
      {
        ...behind,
        headIsAncestorOfOrigin: false,
        originIsAncestorOfHead: false,
      },
      proven,
      ok,
    );
    expect(action.kind).toBe("blocked");
    expect(action.why).toContain("diverged");
  });

  it("is blocked when the checkout is ahead of origin/main", () => {
    const action = decideUpdate(
      {
        ...behind,
        headIsAncestorOfOrigin: false,
        originIsAncestorOfHead: true,
      },
      proven,
      ok,
    );
    expect(action.kind).toBe("blocked");
    expect(action.why).toContain("ahead");
  });

  it("never retries a commit that failed", () => {
    const state = markFailed(proven, B, "typecheck");
    expect(decideUpdate(behind, state, ok)).toMatchObject({
      kind: "skip",
      sha: B,
    });
  });

  it("checks a newer commit after one failed", () => {
    const state = markFailed(proven, B, "typecheck");
    expect(decideUpdate({ ...behind, origin: C }, state, ok)).toMatchObject({
      kind: "gate",
      sha: C,
    });
  });

  it("never fast-forwards a failed docs-only commit either", () => {
    const state = markFailed(proven, B, "fast-forward failed");
    const action = decideUpdate(
      { ...behind, changedPaths: ["docs/a.md"] },
      state,
      ok,
    );
    expect(action.kind).toBe("skip");
  });

  it("waits for HEAD to prove itself before replacing it", () => {
    const action = decideUpdate(behind, noState, ok);
    expect(action.kind).toBe("blocked");
    expect(action.why).toContain("hasn't run long enough");
    expect(decideUpdate(behind, { lastGood: C, failed: {} }, ok).kind).toBe(
      "blocked",
    );
  });

  it("lets a fix through when HEAD is crash-looping and unproven", () => {
    expect(
      decideUpdate(behind, noState, { ...ok, headCrashLooping: true }),
    ).toMatchObject({ kind: "gate", sha: B });
  });

  it("still fast-forwards docs while HEAD is unproven", () => {
    expect(
      decideUpdate({ ...behind, changedPaths: ["docs/a.md"] }, noState, ok)
        .kind,
    ).toBe("fast-forward");
  });

  it("doesn't update while the state file can't be written", () => {
    const action = decideUpdate(behind, proven, {
      ...ok,
      stateWritable: false,
    });
    expect(action.kind).toBe("blocked");
    expect(action.why).toContain("state file");
  });

  it("still skips a failure kept only in memory", () => {
    const state = markFailed(proven, B, "typecheck");
    expect(
      decideUpdate(behind, state, { ...ok, stateWritable: false }).kind,
    ).toBe("skip");
  });
});

describe("isDocsOnlyPath", () => {
  it.each([
    ["ios/Lights.xcodeproj/project.pbxproj", true],
    ["docs/rebuild-plan.md", true],
    ["hardware-interface-runtime/README.md", true],
    ["hardware-interface-runtime/index.tsx", false],
    ["iosish/thing.ts", false],
    ["bun.lock", false],
  ])("%s -> %s", (path, expected) => {
    expect(isDocsOnlyPath(path)).toBe(expected);
  });
});

describe("state", () => {
  it("reads missing or broken state as empty", () => {
    expect(parseState(null)).toEqual({ failed: {} });
    expect(parseState("{nope")).toEqual({ failed: {} });
    expect(parseState('{"lastGood": 3, "failed": null}')).toEqual({
      failed: {},
    });
  });

  it("round-trips", () => {
    const state = markFailed({ lastGood: A, failed: {} }, B, "smoke boot");
    expect(parseState(JSON.stringify(state))).toEqual(state);
  });

  it("keeps only the newest 50 failures", () => {
    let state = noState;
    for (let i = 0; i < 60; i++) state = markFailed(state, `sha${i}`, "x");
    const shas = Object.keys(state.failed);
    expect(shas).toHaveLength(50);
    expect(shas[0]).toBe("sha10");
    expect(shas[49]).toBe("sha59");
  });
});

describe("decideAfterCrash", () => {
  const policy = { limit: 3, windowMs: 10 * 60_000 };
  const now = 1_000_000_000;
  const crashing = {
    head: B,
    lastGood: A,
    lastGoodIsAncestorOfHead: true,
    dirty: false,
    crashTimes: [now - 20_000, now - 10_000, now],
    crashesInARow: 3,
    now,
    policy,
  };

  it("rolls back after 3 crashes in 10 minutes on an unproven commit", () => {
    expect(decideAfterCrash(crashing)).toMatchObject({
      kind: "rollback",
      to: A,
    });
  });

  it("restarts with backoff on fewer crashes", () => {
    const action = decideAfterCrash({
      ...crashing,
      crashTimes: [now - 10_000, now],
      crashesInARow: 2,
    });
    expect(action).toMatchObject({ kind: "restart", delayMs: 2000 });
  });

  it("only counts crashes inside the window", () => {
    const action = decideAfterCrash({
      ...crashing,
      crashTimes: [now - 11 * 60_000, now - 10_000, now],
    });
    expect(action.kind).toBe("restart");
  });

  it("doesn't roll back on the last good commit", () => {
    expect(decideAfterCrash({ ...crashing, head: A }).kind).toBe("restart");
  });

  it("doesn't roll back without a last good commit", () => {
    expect(decideAfterCrash({ ...crashing, lastGood: undefined }).kind).toBe(
      "restart",
    );
  });

  it("doesn't roll back when last good isn't behind HEAD", () => {
    expect(
      decideAfterCrash({ ...crashing, lastGoodIsAncestorOfHead: false }).kind,
    ).toBe("restart");
  });

  it("doesn't roll back over uncommitted changes", () => {
    expect(decideAfterCrash({ ...crashing, dirty: true }).kind).toBe("restart");
  });
});

describe("backoffMs", () => {
  it("doubles from 1 s up to 30 s", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(backoffMs)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
  });
});

describe("stagingDirFor", () => {
  it("puts staging next to the repo by default", () => {
    expect(stagingDirFor("/Users/x/dev/code/effect-sim")).toBe(
      "/Users/x/dev/code/effect-sim-staging",
    );
    expect(stagingDirFor("/Users/x/dev/code/effect-sim/")).toBe(
      "/Users/x/dev/code/effect-sim-staging",
    );
  });

  it("uses HWIR_STAGING_DIR when it's set", () => {
    expect(stagingDirFor("/r", "/elsewhere/stage")).toBe("/elsewhere/stage");
    expect(stagingDirFor("/r", "  ")).toBe("/r-staging");
  });
});

describe("stagingDirProblem", () => {
  const repo = "/Users/x/dev/code/effect-sim";
  it("accepts a folder of its own", () => {
    expect(stagingDirProblem(repo, `${repo}-staging`)).toBeNull();
    expect(stagingDirProblem(repo, "/Users/x/stage")).toBeNull();
  });

  it("refuses the repo, anything holding it, anything in it, and relative paths", () => {
    expect(stagingDirProblem(repo, repo)).toMatch(/is the live repo/);
    expect(stagingDirProblem(repo, `${repo}/`)).toMatch(/is the live repo/);
    expect(stagingDirProblem(repo, "/Users/x")).toMatch(/contains/);
    expect(stagingDirProblem(repo, "/")).toMatch(/contains/);
    expect(stagingDirProblem(repo, `${repo}/staging`)).toMatch(/inside/);
    expect(stagingDirProblem(repo, "staging")).toMatch(/absolute/);
  });
});

describe("gateFailureBlamesCommit", () => {
  it("never blames the commit for an unusable staging dir", () => {
    expect(gateFailureBlamesCommit("staging dir", 99)).toBe(false);
  });

  it("blames a checkout only after it keeps failing", () => {
    expect(gateFailureBlamesCommit("staging checkout", 1)).toBe(false);
    expect(gateFailureBlamesCommit("staging checkout", 2)).toBe(false);
    expect(gateFailureBlamesCommit("staging checkout", 3)).toBe(true);
  });

  it("blames the commit for its own checks", () => {
    for (const step of [
      "entry point check",
      "install",
      "typecheck",
      "smoke boot",
    ])
      expect(gateFailureBlamesCommit(step)).toBe(true);
  });
});
