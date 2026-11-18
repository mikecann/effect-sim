// Where each LED of a string sits in the world, shared by the editor's
// simulator, the effects (through the LED data API) and HWIR.
//
// A camera-mapped string (`ledPositions`, one per LED) is used as it is. A
// hand-drawn one spreads its LEDs along its path the way the editor always
// has: each path segment gets a share of the LEDs in proportion to its
// length, and they're spaced `spacingMeters` apart from the segment's start.
// Some LEDs can end up with no position (a path shorter than the string, or a
// segment too short for its share): those are null, and aren't drawn.

export type Point3 = { x: number; y: number; z: number };

export type Bounds = { min: Point3; max: Point3 };

/** One straight piece of a hand-drawn path, and the LEDs placed on it. */
export type PathSegmentLayout = {
  index: number;
  start: Point3;
  end: Point3;
  length: number;
  /** The first LED on this segment, and how many it was given. */
  startLedIndex: number;
  ledCount: number;
};

export type StringLayout = {
  /** True when the positions came from camera mapping. */
  isMapped: boolean;
  /** One per LED (ledCount long); null where an LED has no place. */
  positions: Array<Point3 | null>;
  /** The path's segments; empty for a mapped string. */
  segments: PathSegmentLayout[];
};

export type StringGeometry = {
  ledCount: number;
  spacingMeters: number;
  pathPoints: ReadonlyArray<{ position: Point3 }>;
  ledPositions?: ReadonlyArray<Point3>;
};

export const distance = (a: Point3, b: Point3) =>
  Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

const lerp = (a: Point3, b: Point3, t: number): Point3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

/** Shares `totalLeds` between segments in proportion to their lengths. */
const allocateLeds = (lengths: number[], totalLeds: number) => {
  const totalLength = lengths.reduce((a, b) => a + b, 0);
  const counts: number[] = [];
  let assigned = 0;
  lengths.forEach((length, i) => {
    const proportion = totalLength > 0 ? length / totalLength : 0;
    const count =
      i === lengths.length - 1
        ? totalLeds - assigned
        : Math.round(totalLeds * proportion);
    counts.push(Math.max(1, count));
    assigned += Math.max(1, count);
  });

  // Rounding can hand out more than there are; take them back from the front.
  while (assigned > totalLeds)
    for (let i = 0; i < counts.length && assigned > totalLeds; i++)
      if (counts[i] > 1) {
        counts[i] -= 1;
        assigned -= 1;
      }

  return counts;
};

/** The LED positions along one segment, `spacing` apart, capped at `maxLeds`. */
const segmentLedPositions = (
  start: Point3,
  end: Point3,
  spacing: number,
  maxLeds: number,
): Point3[] => {
  const length = distance(start, end);
  if (length < 0.001) return [];

  const positions: Point3[] = [];
  for (let d = 0; d <= length; d += spacing)
    positions.push(lerp(start, end, d / length));

  // A last LED at the end when the spacing left a big enough gap.
  const last = positions[positions.length - 1];
  if (last && distance(last, end) > spacing * 0.5) positions.push({ ...end });

  return positions.slice(0, maxLeds);
};

/** Spreads a string's LEDs along a hand-drawn path. */
export const resamplePath = (
  path: ReadonlyArray<Point3>,
  ledCount: number,
  spacingMeters: number,
): StringLayout => {
  const positions: Array<Point3 | null> = new Array(ledCount).fill(null);
  if (path.length < 2) return { isMapped: false, positions, segments: [] };

  const lengths = path
    .slice(0, -1)
    .map((start, i) => distance(start, path[i + 1]));
  const totalLength = lengths.reduce((a, b) => a + b, 0);
  const bySpacing = Math.max(1, Math.round(totalLength / spacingMeters));
  const counts = allocateLeds(lengths, Math.min(ledCount, bySpacing));

  let startLedIndex = 0;
  const segments = lengths.map((length, index) => {
    const segment: PathSegmentLayout = {
      index,
      start: path[index],
      end: path[index + 1],
      length,
      startLedIndex,
      ledCount: counts[index],
    };
    startLedIndex += counts[index];
    return segment;
  });

  for (const segment of segments)
    segmentLedPositions(
      segment.start,
      segment.end,
      spacingMeters,
      segment.ledCount,
    ).forEach((position, i) => {
      const led = segment.startLedIndex + i;
      if (led < ledCount) positions[led] = position;
    });

  return { isMapped: false, positions, segments };
};

/** Where each of a string's LEDs is: mapped positions as they are, else spread along its path. */
export const layoutString = (string: StringGeometry): StringLayout => {
  if (string.ledPositions && string.ledPositions.length > 0)
    return {
      isMapped: true,
      positions: Array.from(
        { length: string.ledCount },
        (_, i) => string.ledPositions?.[i] ?? null,
      ),
      segments: [],
    };
  return resamplePath(
    string.pathPoints.map((p) => p.position),
    string.ledCount,
    string.spacingMeters,
  );
};

/**
 * Gives every LED a position, for effects: an LED with none takes the one
 * before it along the string (the first known one, at the start). All null
 * stays all null.
 */
export const fillMissingPositions = (
  positions: ReadonlyArray<Point3 | null>,
): Array<Point3 | null> => {
  let last = positions.find((p) => p !== null) ?? null;
  return positions.map((p) => {
    if (p) last = p;
    return p ?? last;
  });
};

export type VirtualSegment = {
  nodeId: string;
  fromIndex: number;
  toIndex: number;
  isReversed?: boolean;
};

/** A virtual string's LED positions, through its segments of real strings. */
export const virtualStringPositions = (
  segments: ReadonlyArray<VirtualSegment>,
  positionsOf: (nodeKey: string) => ReadonlyArray<Point3 | null> | null,
): Array<Point3 | null> => {
  const positions: Array<Point3 | null> = [];
  for (const segment of segments) {
    const source = positionsOf(segment.nodeId);
    if (!source) continue;
    const indexes: number[] = [];
    for (let i = segment.fromIndex; i <= segment.toIndex; i++) indexes.push(i);
    if (segment.isReversed) indexes.reverse();
    for (const i of indexes) positions.push(source[i] ?? null);
  }
  return positions;
};

/** The box around some points, or null when there are none. */
export const boundsOf = (points: Iterable<Point3 | null>): Bounds | null => {
  let bounds: Bounds | null = null;
  for (const p of points) {
    if (!p) continue;
    if (!bounds) {
      bounds = { min: { ...p }, max: { ...p } };
      continue;
    }
    bounds.min.x = Math.min(bounds.min.x, p.x);
    bounds.min.y = Math.min(bounds.min.y, p.y);
    bounds.min.z = Math.min(bounds.min.z, p.z);
    bounds.max.x = Math.max(bounds.max.x, p.x);
    bounds.max.y = Math.max(bounds.max.y, p.y);
    bounds.max.z = Math.max(bounds.max.z, p.z);
  }
  return bounds;
};

/** A point's place in the bounds, 0..1 on each axis (0.5 on an axis with no size). */
export const normaliseInBounds = (p: Point3, bounds: Bounds): Point3 => {
  const axis = (value: number, min: number, max: number) =>
    max - min > 1e-9 ? (value - min) / (max - min) : 0.5;
  return {
    x: axis(p.x, bounds.min.x, bounds.max.x),
    y: axis(p.y, bounds.min.y, bounds.max.y),
    z: axis(p.z, bounds.min.z, bounds.max.z),
  };
};
