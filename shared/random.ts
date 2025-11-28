/**
 * Fast hash function for generating pseudo-random numbers from a seed.
 * Used internally by seeded random functions.
 */
const fastHash = (seed: number): number => {
  let h = seed + 0x6d2b79f5;
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return (h ^ (h >>> 14)) >>> 0;
};

/**
 * Generate a random number in [0, 1) range from a seed and index.
 * Use index to generate sequential random numbers from the same base seed.
 */
export const seededRandom = (seed: number, index = 0): number => {
  const h = fastHash(seed + index * 0x9e3779b9);
  return h / 4294967296;
};

/**
 * Fast seeded pseudo-random number generator using a hash-based algorithm.
 * Returns a value in the range [min, max] inclusive.
 */
export const seededRandomIntRange = (
  seed: number,
  min: number,
  max: number,
): number => {
  return Math.floor(seededRandom(seed) * (max - min + 1)) + min;
};
