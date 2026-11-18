import { describe, expect, it } from "vitest";
import {
  boundsOf,
  fillMissingPositions,
  layoutString,
  normaliseInBounds,
  resamplePath,
  virtualStringPositions,
  type Point3,
} from "./stringLayout";

const p = (x: number, y = 0, z = 0): Point3 => ({ x, y, z });
const path = (...points: Point3[]) => points.map((position) => ({ position }));
const close = (a: Point3 | null, b: Point3) => {
  expect(a).not.toBeNull();
  expect(a?.x).toBeCloseTo(b.x, 6);
  expect(a?.y).toBeCloseTo(b.y, 6);
  expect(a?.z).toBeCloseTo(b.z, 6);
};

describe("hand-drawn strings", () => {
  it("spaces LEDs along a straight path, as many as its length holds", () => {
    // 1 m at 0.1 m spacing holds round(1 / 0.1) = 10 LEDs, as it always has.
    const layout = resamplePath([p(0), p(1)], 11, 0.1);
    expect(layout.isMapped).toBe(false);
    expect(layout.segments).toHaveLength(1);
    for (let i = 0; i < 10; i++) close(layout.positions[i], p(i * 0.1));
    expect(layout.positions[10]).toBeNull();
  });

  it("shares LEDs between segments by length, each starting at its own corner", () => {
    const layout = resamplePath([p(0), p(1), p(1, 0.5)], 16, 0.1);
    expect(layout.segments.map((s) => s.ledCount)).toEqual([10, 5]);
    expect(layout.segments[1].startLedIndex).toBe(10);
    close(layout.positions[10], p(1, 0));
    close(layout.positions[14], p(1, 0.4));
    expect(layout.positions[15]).toBeNull();
  });

  it("leaves LEDs without a place when the path is shorter than the string", () => {
    const layout = resamplePath([p(0), p(0.5)], 20, 0.1);
    expect(layout.positions.filter(Boolean)).toHaveLength(5);
    expect(layout.positions[19]).toBeNull();
  });

  it("has no positions until the path has two points", () => {
    expect(resamplePath([p(0)], 5, 0.1).positions).toEqual(
      new Array(5).fill(null),
    );
  });
});

describe("mapped strings", () => {
  it("uses the mapped positions as they are, not spread along the path", () => {
    const mapped = [p(0, 0), p(0.03, 0.2), p(0.5, 0.21), p(0.51, 0.9)];
    const layout = layoutString({
      ledCount: 4,
      spacingMeters: 0.1,
      pathPoints: path(p(0), p(10)),
      ledPositions: mapped,
    });
    expect(layout.isMapped).toBe(true);
    expect(layout.segments).toEqual([]);
    expect(layout.positions).toEqual(mapped);
  });

  it("is resampled from its path when it has no mapped positions", () => {
    const layout = layoutString({
      ledCount: 3,
      spacingMeters: 0.5,
      pathPoints: path(p(0), p(1)),
      ledPositions: [],
    });
    expect(layout.isMapped).toBe(false);
    close(layout.positions[1], p(0.5));
  });
});

describe("positions for effects", () => {
  it("fills gaps from the LED before (or the first known one)", () => {
    expect(fillMissingPositions([null, p(1), null, p(3), null])).toEqual([
      p(1),
      p(1),
      p(1),
      p(3),
      p(3),
    ]);
    expect(fillMissingPositions([null, null])).toEqual([null, null]);
  });

  it("follows a virtual string's segments, reversed ones backwards", () => {
    const strings: Record<string, Point3[]> = {
      a: [p(0), p(1), p(2), p(3)],
      b: [p(10), p(11), p(12)],
    };
    const positions = virtualStringPositions(
      [
        { nodeId: "a", fromIndex: 1, toIndex: 2 },
        { nodeId: "b", fromIndex: 0, toIndex: 2, isReversed: true },
        { nodeId: "gone", fromIndex: 0, toIndex: 5 },
      ],
      (key) => strings[key] ?? null,
    );
    expect(positions).toEqual([p(1), p(2), p(12), p(11), p(10)]);
  });

  it("normalises a point within the house's bounds", () => {
    const bounds = boundsOf([p(0, 0, 0), null, p(10, 4, 0)]);
    expect(bounds).toEqual({ min: p(0, 0, 0), max: p(10, 4, 0) });
    if (!bounds) return;
    expect(normaliseInBounds(p(5, 1, 0), bounds)).toEqual({
      x: 0.5,
      y: 0.25,
      z: 0.5,
    });
    expect(boundsOf([null])).toBeNull();
  });
});
