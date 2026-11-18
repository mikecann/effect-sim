// @vitest-environment node
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { pythonReady, toolDir, venvPython } from "./lib/python";

// py/mapping_cv.py `known_lit`: a block set's photos are only trusted when
// the LEDs already placed (outside where blocks were searched for) stay dark,
// over all and on every string.

const run = (script: string) => {
  const out = spawnSync(venvPython, ["-I", "-c", script], {
    cwd: join(toolDir, "py"),
    encoding: "utf8",
  });
  if (out.status !== 0) throw new Error(out.stderr);
  return JSON.parse(out.stdout.trim()) as Record<string, number>;
};

const setup = `
import sys, json, numpy as np
sys.path.insert(0, ".")
import mapping_cv as m
W = 400
px = lambda p: np.array([p["u"] * W, p["v"] * W])
change = np.zeros((W, W), np.float32)
# 30 placed LEDs on string a (row v=0.2), 30 on string b (row v=0.6).
known = [{"key": "a", "u": 0.1 + i * 0.025, "v": 0.2} for i in range(30)] + [
    {"key": "b", "u": 0.1 + i * 0.025, "v": 0.6} for i in range(30)]
def light(points):
    for p in points:
        x, y = (int(round(v)) for v in px(p))
        change[y, x] = 100
`;

describe.skipIf(!pythonReady())("placed LEDs that light up", () => {
  test("none lit: the set passes", () => {
    const r = run(
      `${setup}\nprint(json.dumps(m.known_lit(change, 10, known, [], px, W)))`,
    );
    expect(r).toMatchObject({ knownLit: 0, knownChecked: 60, worstStringLit: 0 });
  });

  test("one whole string lit shows in that string's share, not just the total", () => {
    const r = run(
      `${setup}\nlight(known[30:])\nprint(json.dumps(m.known_lit(change, 10, known, [], px, W)))`,
    );
    expect(r.knownLit / r.knownChecked).toBeLessThanOrEqual(0.6);
    expect(r.worstStringLit).toBe(1);
  });

  test("only where a block was searched for is left out: the intersection of its regions", () => {
    // Two big circles that overlap only round (0.5, 0.2): a union would
    // cover every placed LED, the intersection only a few.
    const r = run(
      `${setup}\nblocks = [{"regions": [{"u": 0.3, "v": 0.2, "radius": 0.21}, {"u": 0.7, "v": 0.2, "radius": 0.21}]}]\nprint(json.dumps(m.known_lit(change, 10, known, blocks, px, W)))`,
    );
    expect(r.knownChecked).toBeGreaterThan(50);
  });
});

describe.skipIf(!pythonReady())("strings too thin to check", () => {
  test("a string with a block but under 3 placed LEDs left to check is named", () => {
    const r = run(
      `${setup}\nknown2 = known[:2] + known[30:]\nblocks = [{"key": "a", "regions": [{"u": 0.9, "v": 0.9, "radius": 0.01}]}, {"key": "b", "regions": [{"u": 0.9, "v": 0.95, "radius": 0.01}]}]\nprint(json.dumps(m.known_lit(change, 10, known2, blocks, px, W)))`,
    );
    expect(r.uncheckedStrings).toEqual(["a"]);
  });
});
