import { codeOf } from "../../../shared/mapping/ledCodes";
import type { MappingPattern } from "../../../convex/schema";
import { isLit } from "../../../shared/mapping/ledCodes";
import type { MappedString } from "./manifest";

// A made-up night photo of the house for the synthetic test: every LED's 3D
// position (from the strings' hand-drawn paths, spaced as the editor spaces
// them), projected through a pinhole camera, with some LEDs hidden and a few
// pushed onto each other.

type P3 = { x: number; y: number; z: number };

export type HouseString = MappedString & {
  spacingMeters: number;
  pathPoints: P3[];
};

export type SceneLed = {
  key: string;
  index: number;
  x: number;
  y: number;
  visible: boolean;
  brightness: number;
  sigma: number;
  why?: "occluded" | "off-path" | "overlap";
};

export type Scene = {
  width: number;
  height: number;
  windows: [number, number, number, number, number][];
  leds: SceneLed[];
  /** Warm fairy lights that twinkle on their own: x, y, fade group (0 or 1). */
  twinkles?: [number, number, number][];
};

/**
 * Each LED's position along a hand-drawn path, as the editor places them
 * (src/simulator/models/StringUIModel.ts): LEDs shared out over the segments
 * by length, `spacingMeters` apart within each. A path too short for every LED
 * leaves the rest without a position.
 */
export const ledPositionsAlongPath = (s: HouseString): (P3 | null)[] => {
  const pts = s.pathPoints;
  const out: (P3 | null)[] = Array.from({ length: s.ledCount }, () => null);
  if (pts.length < 2) return out;
  const lengths = pts
    .slice(0, -1)
    .map((a, i) =>
      Math.hypot(pts[i + 1].x - a.x, pts[i + 1].y - a.y, pts[i + 1].z - a.z),
    );
  const total = lengths.reduce((a, b) => a + b, 0);
  const totalLeds = Math.min(
    s.ledCount,
    Math.max(1, Math.round(total / s.spacingMeters)),
  );
  const allocations: { startIndex: number; count: number }[] = [];
  let assigned = 0;
  for (let i = 0; i < lengths.length; i++) {
    const count =
      i === lengths.length - 1
        ? totalLeds - assigned
        : Math.round(totalLeds * (total > 0 ? lengths[i] / total : 0));
    allocations.push({ startIndex: assigned, count: Math.max(1, count) });
    assigned += allocations[i].count;
  }
  while (assigned > totalLeds)
    for (let i = 0; i < allocations.length && assigned > totalLeds; i++)
      if (allocations[i].count > 1) {
        allocations[i].count -= 1;
        assigned -= 1;
      }
  let running = 0;
  for (const a of allocations) {
    a.startIndex = running;
    running += a.count;
  }
  allocations.forEach((alloc, seg) => {
    const a = pts[seg];
    const b = pts[seg + 1];
    const len = lengths[seg];
    if (len < 0.001) return;
    const positions: P3[] = [];
    for (let d = 0; d <= len; d += s.spacingMeters)
      positions.push({
        x: a.x + ((b.x - a.x) * d) / len,
        y: a.y + ((b.y - a.y) * d) / len,
        z: a.z + ((b.z - a.z) * d) / len,
      });
    positions.slice(0, alloc.count).forEach((p, i) => {
      if (alloc.startIndex + i < s.ledCount) out[alloc.startIndex + i] = p;
    });
  });
  return out;
};

/** A seeded random number generator (mulberry32), so a scene is repeatable. */
export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const makeScene = (
  strings: HouseString[],
  opts: {
    width?: number;
    height?: number;
    seed?: number;
    yawDegrees?: number;
    eyeHeight?: number;
    occludedFraction?: number;
    overlaps?: number;
    /** How many twinkling warm lights to add (default none). */
    twinkles?: number;
  } = {},
): Scene => {
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const random = rng(opts.seed ?? 1);
  const all = strings.flatMap((s) =>
    ledPositionsAlongPath(s).map((p, index) => ({ key: s.key, index, p })),
  );
  const placed = all.filter((l) => l.p) as {
    key: string;
    index: number;
    p: P3;
  }[];
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const { p } of placed)
    for (const k of ["x", "y", "z"] as const) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  const centre = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };
  const radius = Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2;

  // A camera at head height in front of the house, looking at its middle,
  // far enough back that it all fits.
  const yaw = ((opts.yawDegrees ?? 200) * Math.PI) / 180;
  const fov = (60 * Math.PI) / 180;
  const distance = (radius / Math.tan(fov / 2)) * 1.05;
  const eye = {
    x: centre.x + Math.sin(yaw) * distance,
    y: centre.y + (opts.eyeHeight ?? 1.5),
    z: centre.z + Math.cos(yaw) * distance,
  };
  const fwd = norm(sub(centre, eye));
  const right = norm(cross(fwd, { x: 0, y: 1, z: 0 }));
  const up = cross(right, fwd);
  const f = width / 2 / Math.tan(fov / 2);
  const project = (p: P3) => {
    const d = sub(p, eye);
    const z = dot(d, fwd);
    return {
      x: width / 2 + (f * dot(d, right)) / z - 0.5,
      y: height / 2 - (f * dot(d, up)) / z - 0.5,
      z,
    };
  };

  const leds: SceneLed[] = all.map(({ key, index, p }) => {
    const base = {
      key,
      index,
      brightness: 0.55 + random() * 0.6,
      sigma: 1.2 + random() * 0.6,
    };
    if (!p)
      return {
        ...base,
        x: -100,
        y: -100,
        visible: false,
        why: "off-path" as const,
      };
    const q = project(p);
    const inFrame =
      q.z > 0 && q.x > 8 && q.y > 8 && q.x < width - 8 && q.y < height - 8;
    return {
      ...base,
      x: q.x,
      y: q.y,
      visible: inFrame,
      ...(inFrame ? {} : { why: "occluded" as const }),
    };
  });

  // Runs of LEDs hidden behind things (a tree, a corner of the house).
  const target = Math.round(leds.length * (opts.occludedFraction ?? 0.04));
  let hidden = 0;
  while (hidden < target) {
    const start = Math.floor(random() * leds.length);
    const run = 3 + Math.floor(random() * 10);
    for (let i = start; i < Math.min(leds.length, start + run); i++)
      if (leds[i].visible && leds[i].key === leds[start].key) {
        leds[i].visible = false;
        leds[i].why = "occluded";
        hidden++;
      }
  }

  // Where two strings pass close to each other in the photo, a few LEDs are
  // nudged to 3.5 px from an LED on the other string, so their glows overlap
  // (strings crossing). Each stays in line with its own string.
  const pairs = leds.flatMap((a, i) =>
    leds
      .slice(i + 1)
      .filter(
        (b) =>
          a.visible &&
          b.visible &&
          a.key !== b.key &&
          a.why === undefined &&
          b.why === undefined &&
          Math.hypot(a.x - b.x, a.y - b.y) > 5 &&
          Math.hypot(a.x - b.x, a.y - b.y) < 12,
      )
      .map((b) => [a, b] as const),
  );
  for (let n = 0; n < (opts.overlaps ?? 4) && pairs.length; n++) {
    const [a, b] = pairs.splice(Math.floor(random() * pairs.length), 1)[0];
    if (a.why || b.why) continue;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    b.x = a.x + ((b.x - a.x) / d) * 3.5;
    b.y = a.y + ((b.y - a.y) / d) * 3.5;
    a.why = b.why = "overlap";
  }

  const windows: Scene["windows"] = [
    [Math.round(width * 0.3), Math.round(height * 0.55), 60, 40, 25],
    [Math.round(width * 0.62), Math.round(height * 0.5), 45, 70, 18],
    [Math.round(width * 0.05), Math.round(height * 0.2), 12, 12, 140],
  ];
  // Twinkling warm lights hanging just above some of the strings, like the
  // house's icicle lights (on the same circuit, so they can't be turned off).
  const twinkles: [number, number, number][] = [];
  const shown = leds.filter((l) => l.visible);
  for (let n = 0; n < (opts.twinkles ?? 0) && shown.length; n++) {
    const l = shown[Math.floor(random() * shown.length)];
    twinkles.push([
      l.x + (random() - 0.5) * 12,
      l.y - 8 - random() * 22,
      n % 2,
    ]);
  }
  return { width, height, windows, leds, twinkles };
};

/** Which scene LEDs a pattern lights, in scene order. */
export const litMask = (
  scene: Scene,
  strings: MappedString[],
  pattern: MappingPattern,
) =>
  scene.leds.map((l) =>
    isLit(pattern, l.key, l.index, codeOf(strings, l.key, l.index)),
  );

const sub = (a: P3, b: P3) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: P3, b: P3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: P3, b: P3) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (a: P3) => {
  const l = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
