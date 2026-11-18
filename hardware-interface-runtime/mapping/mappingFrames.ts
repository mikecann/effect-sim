// What HWIR sends while the display is in mapping mode: the session's pattern
// (convex/schema.ts mappingPatternValidator), lit in full white at the
// display's brightness, using the shared LED codes (shared/mapping/ledCodes.ts)
// so the capture tool decodes the same scheme.

import type { MappingPattern } from "../../convex/schema";
import {
  assignCodes,
  isLit,
  type CodedString,
} from "../../shared/mapping/ledCodes";

/**
 * Fills one RGB buffer per string with the pattern. Buffers in `out` are
 * reused when their size still fits.
 */
export const renderPattern = (
  strings: CodedString[],
  pattern: MappingPattern,
  level: number,
  out: Map<string, Uint8Array>,
): Map<string, Uint8Array> => {
  const value = Math.round(255 * Math.min(1, Math.max(0, level)));
  const keys = new Set<string>();
  for (const string of assignCodes(strings)) {
    keys.add(string.key);
    let rgb = out.get(string.key);
    if (!rgb || rgb.length !== string.ledCount * 3) {
      rgb = new Uint8Array(string.ledCount * 3);
      out.set(string.key, rgb);
    }
    for (let i = 0; i < string.ledCount; i++) {
      const v = isLit(pattern, string.key, i, string.firstCode + i) ? value : 0;
      rgb[i * 3] = v;
      rgb[i * 3 + 1] = v;
      rgb[i * 3 + 2] = v;
    }
  }
  for (const key of out.keys()) if (!keys.has(key)) out.delete(key);
  return out;
};

/** Renders only when the pattern, brightness or strings change. */
export class MappingFrames {
  private readonly buffers = new Map<string, Uint8Array>();
  private renderedFor: string | null = null;

  get(strings: CodedString[], pattern: MappingPattern, level: number) {
    const id = JSON.stringify([
      pattern,
      level,
      strings.map((s) => [s.key, s.ledCount]),
    ]);
    if (id !== this.renderedFor) {
      renderPattern(strings, pattern, level, this.buffers);
      this.renderedFor = id;
    }
    return this.buffers;
  }
}
