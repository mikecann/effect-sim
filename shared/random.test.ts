import { describe, expect, it } from "vitest";
import { createRandom, hashSeed } from "./random";

const draw = (seed: number, count = 20) => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => random.next());
};

describe("seeded random numbers", () => {
  it("gives the same run for the same seed", () => {
    expect(draw(hashSeed("event-1", "string-a", 42))).toEqual(
      draw(hashSeed("event-1", "string-a", 42)),
    );
  });

  it("gives a different run for another event, string or frame", () => {
    const base = draw(hashSeed("event-1", "string-a", 42));
    expect(draw(hashSeed("event-2", "string-a", 42))).not.toEqual(base);
    expect(draw(hashSeed("event-1", "string-b", 42))).not.toEqual(base);
    expect(draw(hashSeed("event-1", "string-a", 43))).not.toEqual(base);
  });

  it("keeps to its ranges and looks uniform", () => {
    const random = createRandom(hashSeed("spread"));
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 10_000; i++) {
      const n = random.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      counts[Math.floor(n * 10)]++;
      const int = random.int(3, 5);
      expect([3, 4, 5]).toContain(int);
    }
    for (const count of counts)
      expect(Math.abs(count - 1000)).toBeLessThan(150);
  });

  it("doesn't confuse the parts of a seed", () => {
    expect(hashSeed("ab", "c")).not.toBe(hashSeed("a", "bc"));
  });
});
