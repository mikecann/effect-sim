// @vitest-environment node
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import {
  FillState,
  fillBlocks,
  partition,
  rangesPattern,
  type Block,
} from "./lib/blockFill";
import { FakeSession, ReplayCamera, SyntheticCamera } from "./lib/fakes";
import type { Decoded, DecodedPoint } from "./lib/manifest";
import { PyWorker, pythonReady } from "./lib/python";
import { makeScene, rng, type HouseString } from "./lib/scene";

// The block fill (lib/blockFill.ts): planning blocks round the gaps, and the
// whole fill against a synthetic house with twinkling lights and, when a saved
// real run is at hand, against real photos with real twinkle.

const dirs: string[] = [];
afterAll(() => {
  if (process.env.KEEP_MAPPING_RUN) return;
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const at = (u: number, confidence = 0.8): DecodedPoint => ({
  u,
  v: 0.5,
  confidence,
});

/** A decode of strings along horizontal lines, 0.01 apart, with gaps. */
const decodedOf = (
  strings: { key: string; v: number; points: (number | null)[] }[],
): Decoded => ({
  version: 1,
  imageWidth: 1000,
  imageHeight: 1000,
  totalLeds: strings.reduce((n, s) => n + s.points.length, 0),
  stats: {},
  strings: strings.map((s) => ({
    key: s.key,
    name: s.key,
    ledCount: s.points.length,
    measured: 0,
    interpolated: 0,
    outliers: [],
    points: s.points.map((c, i) =>
      c === null ? null : { ...at(0.1 + i * 0.01, c), v: s.v },
    ),
  })),
  rejected: [],
});

describe("planning blocks", () => {
  test("each gap gets a block in from each end, next to placed LEDs", () => {
    // 0-2 placed, 3-22 missing (one interpolated), 23-24 placed.
    const points = Array.from({ length: 25 }, (_, i) =>
      i < 3 || i > 22 ? 0.8 : i === 5 ? 0.15 : null,
    );
    const fill = new FillState(
      decodedOf([{ key: "a", v: 0.5, points }]),
      ["a"],
      8,
    );
    const { blocks } = fill.plan();
    expect(blocks.map((b) => [b.from, b.to])).toEqual([
      [3, 10],
      [15, 22],
    ]);
    expect(blocks[0].before).toMatchObject({ gap: 1 });
    expect(blocks[0].after).toMatchObject({ gap: 13 });
    expect(blocks[0].step).toBeCloseTo(0.01);
    // Searched for straight on from the LED before it (2, at u 0.12), its
    // middle 4.5 LEDs on, with room to bend; and within reach of LED 2.
    const [ahead, reach] = blocks[0].regions;
    expect(ahead.u).toBeCloseTo(0.165);
    expect(ahead.v).toBeCloseTo(0.5);
    expect(ahead.radius).toBeCloseTo(0.01 * (4 + 2 + 0.15 * 8));
    expect(reach.u).toBeCloseTo(0.12);
    expect(reach.radius).toBeCloseTo(0.01 * (8 * 1.25 + 1.5));
    // Unclear there: next time, half the size and all round LED 2.
    fill.apply(blocks[0], { status: "unclear" });
    const [again] = fill.plan().blocks;
    expect([again.from, again.to]).toEqual([3, 6]);
    expect(again.regions[0].u).toBeCloseTo(0.12);
    // Found: the next block on is twice the size.
    fill.apply(again, {
      status: "found",
      first: 0,
      points: [3, 4, 5, 6].map((i) => at(0.1 + i * 0.01, 0.6)),
    });
    expect(fill.plan().blocks.map((b) => [b.from, b.to])).toEqual([
      [7, 14],
      [15, 22],
    ]);
  });

  test("a short gap is one or two blocks; a string end is filled from its last LED", () => {
    const fill = new FillState(
      decodedOf([
        { key: "a", v: 0.5, points: [0.8, null, null, null, 0.8, 0.8, 0.8] },
        {
          key: "b",
          v: 0.8,
          points: [0.8, 0.8, 0.8, 0.8, null, null, null, null, null, null],
        },
      ]),
      ["a", "b"],
      4,
    );
    const { blocks } = fill.plan();
    expect(blocks.map((b) => [b.key, b.from, b.to])).toEqual([
      ["a", 1, 3],
      ["b", 4, 7],
    ]);
    expect(blocks[1].after).toBeUndefined();
  });

  test("results: found places, hidden empties, unclear splits down to single LEDs", () => {
    const decoded = decodedOf([
      {
        key: "a",
        v: 0.5,
        points: [0.8, ...Array<null>(8).fill(null), 0.8],
      },
    ]);
    const fill = new FillState(decoded, ["a"], 8);
    const [block] = fill.plan().blocks;
    expect([block.from, block.to]).toEqual([1, 8]);
    fill.apply(block, { status: "unclear" });
    expect(fill.plan().blocks.map((b) => [b.from, b.to])).toEqual([
      [1, 4],
      [5, 8],
    ]);
    const [first, second] = fill.plan().blocks;
    fill.apply(first, {
      status: "found",
      first: 0,
      points: [1, 2, 3, 4].map((i) => at(0.1 + i * 0.01, 0.6)),
    });
    fill.apply(second, { status: "hidden" });
    expect(fill.todo()).toBe(0);
    expect(fill.plan().blocks).toEqual([]);
    fill.recount();
    expect(decoded.strings[0]).toMatchObject({ measured: 6, interpolated: 0 });
    expect(decoded.strings[0].points.slice(5, 9)).toEqual([
      null,
      null,
      null,
      null,
    ]);

    // A single LED that's unclear stays as it was, and isn't tried again.
    const single = new FillState(
      decodedOf([{ key: "a", v: 0.5, points: [0.8, 0.15, 0.8] }]),
      ["a"],
      8,
    );
    const [one] = single.plan().blocks;
    single.apply(one, { status: "unclear" });
    expect(single.todo()).toBe(0);
    expect(single.decoded.strings[0].points[1]?.confidence).toBe(0.15);
  });

  test("partial: the LEDs next to the anchor are placed, the rest go on", () => {
    const decoded = decodedOf([
      {
        key: "a",
        v: 0.5,
        points: [0.8, 0.8, ...Array<null>(20).fill(null), 0.8, 0.8],
      },
    ]);
    const fill = new FillState(decoded, ["a"], 8);
    const [front, back] = fill.plan().blocks;
    expect([front.from, front.to, back.from, back.to]).toEqual([2, 9, 14, 21]);
    fill.apply(front, {
      status: "partial",
      first: 0,
      points: [2, 3, 4].map((i) => at(0.1 + i * 0.01, 0.6)),
    });
    // From the LED after the gap, the placed ones are the block's last.
    fill.apply(back, {
      status: "partial",
      first: 6,
      points: [20, 21].map((i) => at(0.1 + i * 0.01, 0.6)),
    });
    expect(decoded.strings[0].points.flatMap((p, i) => (p ? [i] : []))).toEqual(
      [0, 1, 2, 3, 4, 20, 21, 22, 23],
    );
    expect(fill.plan().blocks.map((b) => [b.from, b.to])).toEqual([
      [5, 12],
      [13, 19],
    ]);
  });

  test("a string with nothing decoded is reported, not guessed", () => {
    const fill = new FillState(
      decodedOf([{ key: "a", v: 0.5, points: [null, null, null] }]),
      ["a"],
      8,
    );
    expect(fill.plan()).toEqual({ blocks: [], stranded: ["a"] });
  });

  test("blocks whose regions overlap go in different frames", () => {
    const block = (key: string, u: number, radius: number): Block => ({
      key,
      from: 0,
      to: 7,
      step: 0.01,
      spacing: 0.01,
      regions: [{ u, v: 0.5, radius }],
      side: "before",
      narrow: false,
      around: [{ u, v: 0.5, radius }],
      noisy: false,
    });
    const fill = new FillState(decodedOf([]), [], 8);
    const sets = partition(
      [
        block("a", 0.1, 0.05),
        block("b", 0.15, 0.05), // overlaps a
        block("c", 0.5, 0.05), // clear of both
        block("d", 0.9, 0.4), // big: overlaps c
      ],
      (p, q) => fill.dist(p, q),
    );
    expect(sets.map((s) => s.map((b) => b.key).sort())).toEqual([
      ["a", "d"],
      ["b", "c"],
    ]);
    expect(rangesPattern(sets[0])).toEqual({
      kind: "ranges",
      ranges: [
        { nodeKey: "d", from: 0, to: 7 },
        { nodeKey: "a", from: 0, to: 7 },
      ],
    });
  });
});

/** Photos of each block frame (MAPPING_BLOCK_REPEATS to try others). */
const repeats = Number(process.env.MAPPING_BLOCK_REPEATS ?? 1);

/** Takes runs of LEDs out of a decode, the way real gaps look. */
const knockOut = (decoded: Decoded, fraction: number, seed: number) => {
  const random = rng(seed);
  const total = decoded.strings.reduce(
    (n, s) => n + s.points.filter((p) => p && p.confidence >= 0.3).length,
    0,
  );
  let removed = 0;
  while (removed < total * fraction) {
    const s = decoded.strings[Math.floor(random() * decoded.strings.length)];
    const start = Math.floor(random() * s.points.length);
    const run = 3 + Math.floor(random() * 28);
    for (let i = start; i < Math.min(s.points.length, start + run); i++)
      if (s.points[i]) {
        s.points[i] = null;
        removed++;
      }
  }
  return removed;
};

/** How the fill did against where the LEDs really are (pixels). */
const score = (
  decoded: Decoded,
  truth: Map<string, ({ x: number; y: number } | null)[]>,
  gaps: Set<string>,
) => {
  const { imageWidth: w, imageHeight: h } = decoded;
  const errors: number[] = [];
  let filled = 0,
    wrong = 0,
    visibleGaps = 0,
    phantom = 0,
    cleanFilled = 0,
    cleanWrong = 0;
  // Truth that lines up with its neighbours (in a real decode, points in
  // crowded rows can sit between LEDs, so errors there say little).
  const clean = (pts: ({ x: number; y: number } | null)[], i: number) => {
    const [a, t, b] = [pts[i - 1], pts[i], pts[i + 1]];
    if (!a || !t || !b) return false;
    const da = Math.hypot(t.x - a.x, t.y - a.y);
    const db = Math.hypot(b.x - t.x, b.y - t.y);
    const mid = Math.hypot(t.x - (a.x + b.x) / 2, t.y - (a.y + b.y) / 2);
    return (
      da > 0 && db / da > 0.7 && db / da < 1.4 && mid < (0.3 * (da + db)) / 2
    );
  };
  for (const s of decoded.strings)
    s.points.forEach((p, i) => {
      if (!gaps.has(`${s.key}:${i}`)) return;
      const t = truth.get(s.key)?.[i];
      if (t) visibleGaps++;
      if (!p || p.confidence < 0.3) return;
      if (!t) {
        phantom++;
        return;
      }
      filled++;
      const e = Math.hypot(p.u * w - 0.5 - t.x, p.v * h - 0.5 - t.y);
      errors.push(e);
      if (e > 5) wrong++;
      if (clean(truth.get(s.key) ?? [], i)) {
        cleanFilled++;
        if (e > 5) cleanWrong++;
      }
    });
  errors.sort((a, b) => a - b);
  return {
    visibleGaps,
    filled,
    filledFraction: +(filled / Math.max(1, visibleGaps)).toFixed(3),
    wrong,
    phantom,
    cleanFilled,
    cleanWrong,
    medianErrorPx: +(errors[errors.length >> 1] ?? 0).toFixed(2),
    p95ErrorPx: +(errors[Math.floor(errors.length * 0.95)] ?? 0).toFixed(2),
  };
};

/** The LEDs a decode has no measured point for. */
const gapsOf = (decoded: Decoded) =>
  new Set(
    decoded.strings.flatMap((s) =>
      s.points.flatMap((p, i) =>
        !p || p.confidence < 0.3 ? [`${s.key}:${i}`] : [],
      ),
    ),
  );

// Like the capture test, it renders 4K frames: MAPPING_E2E=1 bun run test.
describe.skipIf(!pythonReady() || process.env.MAPPING_E2E !== "1")(
  "block fill, synthetic house with twinkling lights",
  () => {
    test(
      "fills the gaps within 2 px, leaves hidden LEDs empty",
      { timeout: 300_000 },
      async () => {
        const dir = mkdtempSync(join(tmpdir(), "mapping-blocks-"));
        dirs.push(dir);
        const fixture = JSON.parse(
          readFileSync(
            join(
              import.meta.dirname ?? __dirname,
              "test/fixtures/house-strings.json",
            ),
            "utf8",
          ),
        ) as { strings: HouseString[] };
        const strings = fixture.strings;
        const scene = makeScene(strings, {
          seed: 7,
          width: 3840,
          height: 2160,
          yawDegrees: 330,
          twinkles: 400,
        });
        const scenePath = join(dir, "scene.json");
        writeFileSync(scenePath, JSON.stringify(scene));
        const truth = new Map<string, ({ x: number; y: number } | null)[]>();
        for (const l of scene.leds) {
          const pts = truth.get(l.key) ?? [];
          pts[l.index] = l.visible ? { x: l.x, y: l.y } : null;
          truth.set(l.key, pts);
        }
        // What a decode found: every visible LED, then runs taken out.
        const decoded: Decoded = {
          version: 1,
          imageWidth: scene.width,
          imageHeight: scene.height,
          totalLeds: scene.leds.length,
          stats: {},
          strings: strings.map((s) => ({
            key: s.key,
            name: s.name,
            ledCount: s.ledCount,
            measured: 0,
            interpolated: 0,
            outliers: [],
            points: (truth.get(s.key) ?? []).map((t) =>
              t
                ? {
                    u: (t.x + 0.5) / scene.width,
                    v: (t.y + 0.5) / scene.height,
                    confidence: 0.8,
                  }
                : null,
            ),
          })),
          rejected: [],
        };
        knockOut(decoded, 0.35, 3);
        const gaps = gapsOf(decoded);

        const py = new PyWorker();
        const session = new FakeSession(1);
        const camera = new SyntheticCamera(
          scenePath,
          scene,
          strings,
          session,
          py,
        );
        const lines: string[] = [];
        try {
          const report = await fillBlocks({
            decoded,
            keys: strings.map((s) => s.key),
            session,
            camera,
            py,
            dir: join(dir, "blocks"),
            settleMs: 0,
            repeats,
            log: (l) => lines.push(l),
          });
          const result = score(decoded, truth, gaps);
          const summary = `${lines.join("\n")}\nsynthetic block fill: ${JSON.stringify({ ...result, ...report })}`;
          console.log(summary);
          writeFileSync(join(dir, "report.txt"), summary);
          writeFileSync(join(dir, "filled.json"), JSON.stringify(decoded));
          writeFileSync(join(dir, "scene.json"), JSON.stringify(scene));
          expect(result.filledFraction).toBeGreaterThanOrEqual(0.9);
          expect(result.wrong).toBeLessThanOrEqual(result.filled * 0.03);
          expect(result.phantom).toBe(0);
          expect(result.medianErrorPx).toBeLessThan(1);
        } finally {
          py.close();
        }
      },
    );
  },
);

// A saved real run with near-dark frames to replay (verify-off.jpg and
// verify-led-*.jpg from a single-LED fill): the photos' own twinkle, with
// block light cut from its all-on frame. MAPPING_REPLAY=<run dir>.
const replayRun = process.env.MAPPING_REPLAY;
describe.skipIf(
  !pythonReady() ||
    !replayRun ||
    !existsSync(join(replayRun, "verify-off.jpg")),
)("block fill, replayed real photos", () => {
  test(
    "finds measured LEDs taken out of the decode; finds nothing in real gaps",
    { timeout: 600_000 },
    async () => {
      const run = replayRun ?? "";
      const dir = mkdtempSync(join(tmpdir(), "mapping-replay-"));
      dirs.push(dir);
      const original = JSON.parse(
        readFileSync(join(run, "decoded.json"), "utf8"),
      ) as Decoded;
      // Points a single-LED fill wrote (0.9) may be twinkle; leave them out.
      for (const s of original.strings)
        s.points = s.points.map((p) =>
          p && p.confidence >= 0.3 && p.confidence < 0.85 ? p : null,
        );
      const { imageWidth: w, imageHeight: h } = original;
      const truth = new Map(
        original.strings.map((s) => [
          s.key,
          s.points.map((p) =>
            p ? { x: p.u * w - 0.5, y: p.v * h - 0.5 } : null,
          ),
        ]),
      );
      const decoded = structuredClone(original);
      knockOut(decoded, Number(process.env.MAPPING_REPLAY_KNOCKOUT ?? 0.2), 5);
      const gaps = gapsOf(decoded);
      const bases = [
        "verify-off.jpg",
        ...Array.from({ length: 40 }, (_, i) => `verify-led-2-${i}.jpg`),
      ]
        .map((f) => join(run, f))
        .filter((f) => existsSync(f));

      const py = new PyWorker();
      const session = new FakeSession(1);
      // Each LED's light: about half the usual step round its point.
      const step = new FillState(original, [], 8).step(
        original.strings[0].key,
        0,
        original.strings[0].ledCount,
      );
      const camera = new ReplayCamera(
        {
          bases,
          allOn: join(run, "all.jpg"),
          dark: join(run, "dark.jpg"),
          truth: new Map(
            original.strings.map((s) => [
              s.key,
              s.points.map((p) => (p ? { u: p.u, v: p.v } : null)),
            ]),
          ),
          radius: step * Math.max(w, h) * 0.45,
        },
        session,
        py,
      );
      const lines: string[] = [];
      try {
        const report = await fillBlocks({
          decoded,
          keys: decoded.strings.map((s) => s.key),
          session,
          camera,
          py,
          dir: join(dir, "blocks"),
          settleMs: 0,
          repeats,
          minutes: 30,
          log: (l) => lines.push(l),
        });
        const result = score(decoded, truth, gaps);
        const summary = `${lines.join("\n")}\nreplayed block fill: ${JSON.stringify({ ...result, ...report })}`;
        console.log(summary);
        writeFileSync(join(dir, "report.txt"), summary);
        writeFileSync(join(dir, "filled.json"), JSON.stringify(decoded));
        writeFileSync(join(dir, "truth.json"), JSON.stringify(original));
        // Real gaps light nothing in a replay: anything placed there is
        // twinkle that got through.
        expect(result.phantom).toBeLessThanOrEqual(8);
        expect(result.filledFraction).toBeGreaterThanOrEqual(0.7);
        expect(result.cleanWrong).toBeLessThanOrEqual(
          result.cleanFilled * 0.03,
        );
      } finally {
        py.close();
      }
    },
  );
});
