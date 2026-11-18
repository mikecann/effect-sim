import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MappingPattern } from "../../../convex/schema";
import type { Camera } from "./cameras";
import type { Decoded, DecodedPoint } from "./manifest";
import type { PyWorker } from "./python";
import type { MappingSessionDriver } from "./session";

// Filling the decode's gaps a block of LEDs at a time (`verify --fill-blocks`,
// README "Filling gaps"). The bit patterns leave gaps where glows crowd
// together; lighting single LEDs to fill them is slow, and on the house the
// twinkling icicle lights change more than one LED does. So:
//
// - Each gap is lit a block of LEDs at a time (8 by default), working in from
//   the LEDs either side of it, so every block is searched for only in a small
//   region next to LEDs already placed. Blocks whose regions are far apart in
//   the photo light together in one frame, so a round of blocks takes a few
//   frames, not one per block.
// - Each block frame is taken twice, with off frames between. Only light that
//   is on in every block frame and brighter than in every recent off frame
//   counts (py/mapping_cv.py `steady_change`): a twinkling light has to be on
//   in all of one and off in all of the other to get through.
// - A lit block is a short line of spots. Ordered along the line from the
//   known LED before it, they're the block's LEDs in index order. A block
//   that doesn't come out as one spot per LED is split in half and tried again
//   next round, down to single LEDs; one with nothing lit is hidden from this
//   view.

/** A point the decoder (or a fill) measured, not interpolated. */
const MEASURED = 0.3;

const isMeasured = (p: DecodedPoint | null | undefined): p is DecodedPoint =>
  !!p && p.confidence >= MEASURED;

/** A circle in the photo: u, v and radius in units of the image's long side. */
export type Region = { u: number; v: number; radius: number };

/** The LED before (or after) a block that's already placed, `gap` LEDs away. */
export type Anchor = { u: number; v: number; gap: number };

export type Block = {
  key: string;
  from: number;
  to: number;
  /** Usual distance between neighbouring LEDs near here (long-side units). */
  step: number;
  /** The distance between the anchor and its placed neighbour: the spacing
   *  the block's first spots should have (perspective makes it differ from
   *  `step` along a string). */
  spacing: number;
  /** Where the block can be: inside all of these. */
  regions: Region[];
  before?: Anchor;
  after?: Anchor;
  /** Which placed LED the block works in from. */
  side: "before" | "after";
  /** Searched for only straight on from the anchor. */
  narrow: boolean;
  /** Where it can be if the string turns at the anchor: all round it. */
  around: Region[];
  /** Twinkling light got through here before: photograph it twice. */
  noisy: boolean;
};

type LedState = "todo" | "done" | "hidden" | "unclear";

export type BlockResult =
  /** Points for block LEDs `first`.. in index order: all of them when
   *  found, the ones next to the anchor when partial. */
  | { status: "found" | "partial"; first: number; points: DecodedPoint[] }
  | {
      status: "hidden" | "unclear";
      why?: string;
      /** Searched all round the anchor too (Block `around`). */
      wide?: boolean;
    };

/** What the fill knows about each LED of the strings it's filling. */
export class FillState {
  readonly state = new Map<string, LedState[]>();
  /** Block size to try next, per LED: halved when a block is unclear, grown
   *  along a gap while blocks keep being found. */
  readonly size = new Map<string, number[]>();
  /** LEDs to search for all round their anchor, not just straight on from
   *  it (a block there was unclear: the string may turn a corner). */
  readonly wide = new Map<string, boolean[]>();
  /** LEDs where light other than the block's got through (a twinkle):
   *  their blocks get photographed twice. */
  readonly noisy = new Map<string, boolean[]>();
  /** Strings whose decoded points don't line up like a string's: no
   *  anchors to work from (offline, or mostly mis-decoded). */
  readonly scattered: string[] = [];
  /** Every result put in, in order (written next to the frames). */
  readonly history: (Pick<Block, "key" | "from" | "to" | "side"> & {
    status: BlockResult["status"];
    placed: number;
    detail: Record<string, unknown>;
  })[] = [];
  private readonly aspect: { x: number; y: number };
  /** The usual step between neighbouring LEDs over the whole photo. */
  private readonly typicalStep: number;

  constructor(
    readonly decoded: Decoded,
    keys: string[],
    readonly blockSize: number,
    readonly maxBlockSize = blockSize * 4,
  ) {
    const side = Math.max(decoded.imageWidth, decoded.imageHeight);
    this.aspect = {
      x: decoded.imageWidth / side,
      y: decoded.imageHeight / side,
    };
    this.typicalStep =
      median(
        decoded.strings.flatMap((s) =>
          this.steps(s.points, 0, s.points.length),
        ),
      ) || 0.004;
    for (const key of keys) {
      const s = this.string(key);
      const own = median(this.steps(s.points, 0, s.points.length));
      if (own > this.typicalStep * 2.5) {
        this.scattered.push(key);
        continue;
      }
      this.state.set(
        key,
        s.points.map((p) => (isMeasured(p) ? "done" : "todo")),
      );
      this.size.set(
        key,
        s.points.map(() => blockSize),
      );
      this.wide.set(
        key,
        s.points.map(() => false),
      );
      this.noisy.set(
        key,
        s.points.map(() => false),
      );
    }
  }

  string(key: string) {
    const s = this.decoded.strings.find((x) => x.key === key);
    if (!s) throw new Error(`The decode has no string ${key}.`);
    return s;
  }

  /** Distance between two points in long-side units. */
  dist(p: { u: number; v: number }, q: { u: number; v: number }) {
    return Math.hypot((p.u - q.u) * this.aspect.x, (p.v - q.v) * this.aspect.y);
  }

  /** The usual step between neighbouring measured LEDs near [from, to]. */
  step(key: string, from: number, to: number) {
    const pts = this.string(key).points;
    const near = this.steps(pts, from - 15, to + 15);
    const step = median(
      near.length >= 3 ? near : this.steps(pts, 0, pts.length),
    );
    // A wrong point next to the gap mustn't make the region huge.
    return Math.min(step || this.typicalStep, this.typicalStep * 2);
  }

  private steps(pts: (DecodedPoint | null)[], lo: number, hi: number) {
    const out: number[] = [];
    for (let i = Math.max(0, lo); i < Math.min(pts.length - 1, hi); i++) {
      const p = pts[i];
      const q = pts[i + 1];
      if (isMeasured(p) && isMeasured(q)) out.push(this.dist(p, q));
    }
    return out;
  }

  /** LEDs still to fill. */
  todo() {
    let n = 0;
    for (const s of this.state.values())
      for (const st of s) if (st === "todo") n++;
    return n;
  }

  /** The next blocks: one in from each end of every gap. */
  plan(): { blocks: Block[]; stranded: string[] } {
    const blocks: Block[] = [];
    const stranded: string[] = [];
    for (const [key, state] of this.state) {
      const pts = this.string(key).points;
      const size = this.size.get(key) ?? [];
      let i = 0;
      while (i < state.length) {
        if (state[i] !== "todo") {
          i++;
          continue;
        }
        let end = i;
        while (end + 1 < state.length && state[end + 1] === "todo") end++;
        let a = i - 1;
        while (a >= 0 && !(state[a] === "done" && isMeasured(pts[a]))) a--;
        let b = end + 1;
        while (b < state.length && !(state[b] === "done" && isMeasured(pts[b])))
          b++;
        const before = a >= 0 ? a : null;
        const after = b < state.length ? b : null;
        if (before === null && after === null) {
          stranded.push(key);
          break;
        }
        let next = i;
        if (before !== null) {
          const to = Math.min(end, i + size[i] - 1);
          blocks.push(this.block(key, i, to, before, after, "before"));
          next = to + 1;
        }
        if (after !== null && next <= end)
          blocks.push(
            this.block(
              key,
              Math.max(next, end - size[end] + 1),
              end,
              before,
              after,
              "after",
            ),
          );
        i = end + 1;
      }
    }
    return { blocks, stranded };
  }

  /**
   * Which way the string runs at a placed LED, from the placed LED a few
   * further on from the gap: LED i is about at `p + per * (i - index)`.
   */
  private trend(key: string, index: number, away: 1 | -1) {
    const pts = this.string(key).points;
    const p = pts[index];
    if (!isMeasured(p)) return null;
    for (let k = 1; k <= 4; k++) {
      const q = pts[index + away * k];
      if (isMeasured(q))
        return {
          p,
          per: { u: (q.u - p.u) / (away * k), v: (q.v - p.v) / (away * k) },
        };
    }
    return null;
  }

  private block(
    key: string,
    from: number,
    to: number,
    a: number | null,
    b: number | null,
    side: "before" | "after",
  ): Block {
    const pts = this.string(key).points;
    const step = this.step(key, from, to);
    const regions: Region[] = [];
    const pa = a === null ? null : pts[a];
    const pb = b === null ? null : pts[b];
    // Straight on from the LED it works in from, where the string's last few
    // LEDs point, with room for it to bend the further it goes.
    const anchor = side === "before" ? a : b;
    const trend =
      anchor === null
        ? null
        : this.trend(key, anchor, side === "before" ? -1 : 1);
    const spacing = trend ? this.dist({ u: 0, v: 0 }, trend.per) : step;
    const narrow =
      !!trend && !this.wide.get(key)?.[side === "before" ? from : to];
    if (trend && narrow && anchor !== null) {
      const mid = (from + to) / 2 - anchor;
      const far = Math.max(Math.abs(from - anchor), Math.abs(to - anchor));
      regions.push({
        u: trend.p.u + trend.per.u * mid,
        v: trend.p.v + trend.per.v * mid,
        radius: step * ((to - from + 1) / 2 + 2 + 0.15 * far),
      });
    }
    // A string can't run further from a placed LED than its length allows
    // (with room for perspective), and a gap between two placed LEDs bows
    // out by at most about half their distance.
    if (pa && a !== null)
      regions.push({
        u: pa.u,
        v: pa.v,
        radius: step * ((to - a) * 1.25 + 1.5),
      });
    if (pb && b !== null)
      regions.push({
        u: pb.u,
        v: pb.v,
        radius: step * ((b - from) * 1.25 + 1.5),
      });
    if (pa && pb)
      regions.push({
        u: (pa.u + pb.u) / 2,
        v: (pa.v + pb.v) / 2,
        radius: this.dist(pa, pb) / 2 + step * 3,
      });
    const around = regions.slice(trend && narrow ? 1 : 0);
    return {
      key,
      from,
      to,
      step,
      spacing: Math.min(Math.max(spacing, step * 0.5), step * 2),
      regions,
      ...(pa && a !== null
        ? { before: { u: pa.u, v: pa.v, gap: from - a } }
        : {}),
      ...(pb && b !== null ? { after: { u: pb.u, v: pb.v, gap: b - to } } : {}),
      side,
      narrow,
      around,
      noisy: (this.noisy.get(key) ?? []).slice(from, to + 1).some((x) => x),
    };
  }

  /** Puts a round's results in. */
  apply(block: Block, result: BlockResult) {
    const s = this.string(block.key);
    const state = this.state.get(block.key);
    const size = this.size.get(block.key);
    if (!state || !size) return;
    const wide = this.wide.get(block.key) ?? [];
    const count = block.to - block.from + 1;
    this.history.push({
      key: block.key,
      from: block.from,
      to: block.to,
      side: block.side,
      status: result.status,
      placed: "points" in result ? result.points.length : 0,
      detail: Object.fromEntries(
        Object.entries(result).filter(([k]) => k !== "points"),
      ),
    });
    if (result.status === "hidden" && block.narrow && !result.wide) {
      // Nothing straight on from the anchor: the string may turn there.
      // Look all round it before calling the block hidden.
      for (let i = block.from; i <= block.to; i++) wide[i] = true;
      return;
    }
    if (result.status === "partial") {
      // The LEDs next to the anchor are placed; the next block carries on
      // from the last of them.
      for (const [k, p] of result.points.entries()) {
        s.points[block.from + result.first + k] = p;
        state[block.from + result.first + k] = "done";
      }
      return;
    }
    const noisy = this.noisy.get(block.key) ?? [];
    if (
      result.status === "unclear" &&
      result.why === "other light in the region" &&
      !block.noisy
    ) {
      // Probably a twinkle: same block again, with a second photo.
      for (let i = block.from; i <= block.to; i++) noisy[i] = true;
      return;
    }
    for (let i = block.from; i <= block.to; i++)
      if (result.status === "found") {
        s.points[i] = result.points[i - block.from - result.first];
        state[i] = "done";
      } else if (result.status === "hidden") {
        // Not visible from here: no guess either (another view may see it).
        s.points[i] = null;
        state[i] = "hidden";
      } else if (count > 1) {
        size[i] = Math.ceil(count / 2);
        wide[i] = true;
      } else state[i] = "unclear";
    // The next block on into a long gap can be bigger: it starts right next
    // to LEDs just placed, or carries on along a stretch hidden from here.
    const next = block.side === "before" ? block.to + 1 : block.from - 1;
    if (
      result.status !== "unclear" &&
      state[next] === "todo" &&
      size[next] >= count
    )
      size[next] = Math.min(this.maxBlockSize, count * 2);
  }

  /** Recounts each string's measured and interpolated points. */
  recount() {
    for (const s of this.decoded.strings) {
      s.measured = s.points.filter(isMeasured).length;
      s.interpolated = s.points.filter((p) => p && !isMeasured(p)).length;
    }
  }

  counts(key: string) {
    const c = { done: 0, hidden: 0, unclear: 0, todo: 0 };
    for (const st of this.state.get(key) ?? []) c[st]++;
    return c;
  }
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
};

/** The smallest of a block's regions: all of the block is inside it. */
const bounds = (b: Block) =>
  b.regions.reduce((m, r) => (r.radius < m.radius ? r : m));

/** Whether two blocks' regions are clear of each other. */
const apart = (b: Block, o: Block, dist: (p: Region, q: Region) => number) => {
  const rb = bounds(b);
  const ro = bounds(o);
  // A step's margin either side: glows reach past an LED's centre.
  return dist(rb, ro) > rb.radius + ro.radius + Math.max(b.step, o.step);
};

/**
 * Groups blocks into sets whose regions don't overlap, so each set lights in
 * one frame and every lit spot belongs to one block. Big regions go first.
 */
export const partition = (
  blocks: Block[],
  dist: (p: Region, q: Region) => number,
  maxPerSet = 200,
): Block[][] => {
  const sets: Block[][] = [];
  const sorted = [...blocks].sort(
    (x, y) => bounds(y).radius - bounds(x).radius,
  );
  for (const b of sorted) {
    const home = sets.find(
      (set) => set.length < maxPerSet && set.every((o) => apart(b, o, dist)),
    );
    if (home) home.push(b);
    else sets.push([b]);
  }
  return sets;
};

export const rangesPattern = (set: Block[]): MappingPattern => ({
  kind: "ranges",
  ranges: set.map((b) => ({ nodeKey: b.key, from: b.from, to: b.to })),
});

/** The part of the photo the strings are in, in pixels, with a margin. */
export const cropOf = (decoded: Decoded): [number, number, number, number] => {
  const { imageWidth: w, imageHeight: h } = decoded;
  let x0 = w,
    y0 = h,
    x1 = 0,
    y1 = 0;
  for (const s of decoded.strings)
    for (const p of s.points)
      if (p) {
        x0 = Math.min(x0, p.u * w);
        x1 = Math.max(x1, p.u * w);
        y0 = Math.min(y0, p.v * h);
        y1 = Math.max(y1, p.v * h);
      }
  if (x1 < x0) return [0, 0, w, h];
  const m = Math.max(w, h) * 0.08;
  return [
    Math.max(0, Math.floor(x0 - m)),
    Math.max(0, Math.floor(y0 - m)),
    Math.min(w, Math.ceil(x1 + m)),
    Math.min(h, Math.ceil(y1 + m)),
  ];
};

export type BlockFillReport = {
  rounds: number;
  frames: number;
  seconds: number;
  /** Mean seconds per photo (show, ack, settle, snap). */
  secondsPerFrame: number;
  /** LEDs the fill started with to do. */
  todo: number;
  found: number;
  hidden: number;
  unclear: number;
  /** LEDs it didn't get to (time ran out). */
  left: number;
  stranded: string[];
};

/**
 * Fills the gaps of these strings in `decoded` (changed in place): rounds of
 * blocks until every gap LED is placed, hidden or unclear, or time runs out.
 */
/**
 * Placed LEDs spread over every string (up to 40 each): none is in a block,
 * so a block photo should leave them dark. The Python side throws a set out
 * when many light up, over all or on any one string (the lights weren't
 * showing the blocks), or when too few are left to check.
 */
export const knownSample = (decoded: Decoded, perString = 40) =>
  decoded.strings.flatMap((s) => {
    const placed = s.points.flatMap((p) =>
      p && p.confidence >= 0.3 ? [{ key: s.key, u: p.u, v: p.v }] : [],
    );
    const every = Math.max(1, Math.ceil(placed.length / perString));
    return placed.filter((_, i) => i % every === 0);
  });

export const fillBlocks = async (args: {
  decoded: Decoded;
  keys: string[];
  names?: Map<string, string>;
  session: MappingSessionDriver;
  camera: Camera;
  py: PyWorker;
  dir: string;
  settleMs: number;
  blockSize?: number;
  repeats?: number;
  offFrames?: number;
  minutes?: number;
  maxRounds?: number;
  log: (line: string) => void;
}): Promise<BlockFillReport> => {
  const {
    decoded,
    session,
    camera,
    py,
    dir,
    settleMs,
    blockSize = 8,
    repeats = 1,
    offFrames = 6,
    minutes = 6,
    maxRounds = 40,
    log,
  } = args;
  mkdirSync(dir, { recursive: true });
  const fill = new FillState(decoded, args.keys, blockSize);
  const name = (key: string) => args.names?.get(key) ?? key;
  const startTodo = fill.todo();
  const crop = cropOf(decoded);
  const started = Date.now();
  let frames = 0;
  let shotMs = 0;
  const snap = async (pattern: MappingPattern, file: string) => {
    const t = Date.now();
    await session.show(pattern);
    const path = join(dir, file);
    await camera.snap(path, { name: file, pattern }, settleMs);
    shotMs += Date.now() - t;
    frames++;
    return path;
  };
  const offs: string[] = [];
  const takeOff = async () =>
    offs.push(await snap({ kind: "off" }, `off-${offs.length + 1}.jpg`));
  await takeOff();
  await takeOff();

  let rounds = 0;
  let stranded: string[] = [];
  const tally = { found: 0, hidden: 0, unclear: 0 };
  while (rounds < maxRounds) {
    const { blocks, stranded: none } = fill.plan();
    stranded = none;
    if (!blocks.length) break;
    if ((Date.now() - started) / 60_000 > minutes) {
      log(`Out of time (--minutes ${minutes}); stopping.`);
      break;
    }
    rounds++;
    const sets = partition(blocks, (p, q) => fill.dist(p, q));
    // Another set's frame lit nothing near a block if none of its blocks'
    // regions come near this one's: it's an off frame for this block too.
    const clearOf = (b: Block, set: Block[]) =>
      set.every((o) => apart(b, o, (p, q) => fill.dist(p, q)));
    const roundStarted = Date.now();
    const files = sets.map(() => [] as string[]);
    // A set with a block where twinkle got through before gets one photo
    // more: only light in all of a set's photos counts.
    const reps = sets.map((set) =>
      set.some((b) => b.noisy) ? repeats + 1 : repeats,
    );
    for (let rep = 0; rep < Math.max(...reps); rep++) {
      for (const [s, set] of sets.entries())
        if (rep < reps[s])
          files[s].push(
            await snap(
              rangesPattern(set),
              `r${rounds}-s${s + 1}-${rep + 1}.jpg`,
            ),
          );
      await takeOff();
    }
    const counts = { found: 0, hidden: 0, unclear: 0 };
    for (const [s, set] of sets.entries()) {
      const res = await py.call<{ blocks: (BlockResult & object)[] }>(
        "blocks",
        {
          on: files[s],
          off: offs.slice(-offFrames),
          blocks: set.map((b) => ({
            off: [
              ...offs.slice(-offFrames),
              ...sets.flatMap((other, o) =>
                o !== s && clearOf(b, other) ? files[o] : [],
              ),
            ],
            count: b.to - b.from + 1,
            regions: b.regions,
            // All round the anchor on the same photos, where that's clear of
            // the other blocks lit with it.
            fallback:
              b.narrow &&
              set.every(
                (o) =>
                  o === b ||
                  apart({ ...b, regions: b.around }, o, (p, q) =>
                    fill.dist(p, q),
                  ),
              )
                ? b.around
                : null,
            before: b.before ?? null,
            after: b.after ?? null,
            side: b.side,
            step: b.step,
            spacing: b.spacing,
          })),
          crop,
          known: knownSample(decoded),
          debug: join(dir, `r${rounds}-s${s + 1}-debug.jpg`),
        },
      );
      for (const [k, b] of set.entries()) {
        const r = res.blocks[k];
        fill.apply(b, r);
        const n = b.to - b.from + 1;
        if (r.status === "found") counts.found += n;
        else if (r.status === "partial") counts.found += r.points.length;
        else if (r.status === "hidden" && (!b.narrow || r.wide))
          counts.hidden += n;
        else if (n === 1) counts.unclear++;
      }
    }
    tally.found += counts.found;
    tally.hidden += counts.hidden;
    tally.unclear += counts.unclear;
    log(
      `Round ${rounds}: ${blocks.length} blocks lit in ${sets.length} frames, ${files.flat().length + Math.max(...reps)} photos (${((Date.now() - roundStarted) / 1000).toFixed(1)} s): ${counts.found} LEDs placed, ${counts.hidden} hidden${counts.unclear ? `, ${counts.unclear} unclear` : ""}; ${fill.todo()} to go.`,
    );
  }
  fill.recount();
  writeFileSync(join(dir, "history.json"), JSON.stringify(fill.history));
  for (const key of args.keys) {
    if (fill.scattered.includes(key)) continue;
    const c = fill.counts(key);
    log(
      `  ${name(key).padEnd(12)} ${String(c.done).padStart(4)} placed ${String(c.hidden).padStart(4)} hidden ${String(c.unclear).padStart(3)} unclear ${String(c.todo).padStart(4)} left`,
    );
  }
  for (const key of new Set(stranded))
    log(
      `  ${name(key)}: nothing on it was decoded, so there's nowhere to start. Capture it from another view.`,
    );
  for (const key of fill.scattered)
    log(
      `  ${name(key)}: skipped, its decoded points are scattered rather than along a line (offline, or mis-decoded). Check it's live and capture again.`,
    );
  const seconds = (Date.now() - started) / 1000;
  return {
    rounds,
    frames,
    seconds,
    secondsPerFrame: frames ? shotMs / 1000 / frames : 0,
    todo: startTodo,
    ...tally,
    left: fill.todo(),
    stranded: [...new Set(stranded)],
  };
};
