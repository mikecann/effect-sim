// Seeded random numbers, so an effect lights the same LEDs every time it
// plays: in the editor, while scrubbing, and on the real lights.

/** A source of random numbers that always gives the same run for the same seed. */
export type Random = {
  /** 0 (inclusive) to 1 (exclusive). */
  next(): number;
  /** min (inclusive) to max (exclusive). */
  range(min: number, max: number): number;
  /** A whole number from min to max, both inclusive. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
};

/** Hashes strings and numbers into a 32-bit seed (FNV-1a). */
export const hashSeed = (...parts: Array<string | number>): number => {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const text = `${part}|`;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0;
};

/** A seeded generator (mulberry32). */
export const createRandom = (seed: number): Random => {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
  };
};
