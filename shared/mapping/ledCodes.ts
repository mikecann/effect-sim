// How the camera mapping tells LEDs apart (docs/rebuild-plan.md, "Mapping").
//
// Every LED on every mapped string gets a code from 1 upwards: strings in key
// order, LEDs in index order. Code 0 is never used, so an LED that never lights
// in any frame can't be mistaken for a real one. A "bit" pattern lights each
// LED whose code has that bit set (or clear, when inverted), so about 11 pairs
// of frames identify every LED on the house at once.

import type { MappingPattern } from "../../convex/schema";

export type CodedString = { key: string; ledCount: number };

/** The first code of each string, in key order. */
export const assignCodes = (strings: CodedString[]) => {
  const sorted = [...strings].sort((a, b) => a.key.localeCompare(b.key));
  let next = 1;
  return sorted.map((string) => {
    const firstCode = next;
    next += string.ledCount;
    return { ...string, firstCode };
  });
};

/** How many bit patterns it takes to tell every LED apart. */
export const bitsNeeded = (strings: CodedString[]) => {
  const total = strings.reduce((sum, s) => sum + s.ledCount, 0);
  return Math.max(1, Math.ceil(Math.log2(total + 1)));
};

/** The code of an LED, or null if it isn't on a mapped string. */
export const codeOf = (
  strings: CodedString[],
  key: string,
  index: number,
): number | null => {
  const string = assignCodes(strings).find((s) => s.key === key);
  if (!string || index < 0 || index >= string.ledCount) return null;
  return string.firstCode + index;
};

/** The LED a decoded code belongs to, or null if no LED has it. */
export const ledOfCode = (
  strings: CodedString[],
  code: number,
): { key: string; index: number } | null => {
  for (const string of assignCodes(strings))
    if (code >= string.firstCode && code < string.firstCode + string.ledCount)
      return { key: string.key, index: code - string.firstCode };
  return null;
};

/** Whether a pattern lights this LED. */
export const isLit = (
  pattern: MappingPattern,
  key: string,
  index: number,
  code: number | null,
): boolean => {
  if (pattern.kind === "off") return false;
  if (pattern.kind === "all") return true;
  if (pattern.kind === "string") return pattern.nodeKey === key;
  if (pattern.kind === "led")
    return pattern.nodeKey === key && pattern.index === index;
  if (pattern.kind === "ranges")
    return pattern.ranges.some(
      (r) => r.nodeKey === key && index >= r.from && index <= r.to,
    );
  if (code === null) return false;
  return (((code >> pattern.bit) & 1) === 1) !== pattern.inverted;
};
