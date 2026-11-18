import { describe, expect, it } from "vitest";
import type { MappingPattern } from "../../convex/schema";
import { codeOf } from "../../shared/mapping/ledCodes";
import { MappingFrames, renderPattern } from "./mappingFrames";
import { MAX_ACK_ATTEMPTS, MappingAcker } from "./MappingAcker";

// Given out of key order on purpose: codes go by key.
const strings = [
  { key: "b-porch", ledCount: 3 },
  { key: "a-roof", ledCount: 4 },
];

/** Which LEDs a rendered pattern lights, per string, as 0/1. */
const lit = (pattern: MappingPattern, level = 1) => {
  const out = renderPattern(strings, pattern, level, new Map());
  const result: Record<string, number[]> = {};
  for (const [key, rgb] of out) {
    const leds: number[] = [];
    for (let i = 0; i < rgb.length; i += 3) {
      // Full white or nothing.
      expect(rgb[i]).toBe(rgb[i + 1]);
      expect(rgb[i]).toBe(rgb[i + 2]);
      leds.push(rgb[i] > 0 ? 1 : 0);
    }
    result[key] = leds;
  }
  return result;
};

describe("mapping patterns", () => {
  it("off lights nothing, all lights everything", () => {
    expect(lit({ kind: "off" })).toEqual({
      "a-roof": [0, 0, 0, 0],
      "b-porch": [0, 0, 0],
    });
    expect(lit({ kind: "all" })).toEqual({
      "a-roof": [1, 1, 1, 1],
      "b-porch": [1, 1, 1],
    });
  });

  it("string lights one string", () => {
    expect(lit({ kind: "string", nodeKey: "b-porch" })).toEqual({
      "a-roof": [0, 0, 0, 0],
      "b-porch": [1, 1, 1],
    });
  });

  it("led lights one LED", () => {
    expect(lit({ kind: "led", nodeKey: "a-roof", index: 2 })).toEqual({
      "a-roof": [0, 0, 1, 0],
      "b-porch": [0, 0, 0],
    });
  });

  it("bit lights the LEDs whose shared code has the bit, and the rest when inverted", () => {
    // a-roof is codes 1-4, b-porch 5-7 (shared/mapping/ledCodes.ts).
    expect(codeOf(strings, "b-porch", 0)).toBe(5);
    expect(lit({ kind: "bit", bit: 0, inverted: false })).toEqual({
      "a-roof": [1, 0, 1, 0], // 1 2 3 4
      "b-porch": [1, 0, 1], // 5 6 7
    });
    expect(lit({ kind: "bit", bit: 2, inverted: false })).toEqual({
      "a-roof": [0, 0, 0, 1],
      "b-porch": [1, 1, 1],
    });
    expect(lit({ kind: "bit", bit: 2, inverted: true })).toEqual({
      "a-roof": [1, 1, 1, 0],
      "b-porch": [0, 0, 0],
    });
  });

  it("every LED's code can be read back from the bit frames", () => {
    const bits = 3;
    const read: Record<string, number[]> = { "a-roof": [], "b-porch": [] };
    for (const s of strings)
      for (let i = 0; i < s.ledCount; i++) {
        let code = 0;
        for (let bit = 0; bit < bits; bit++) {
          const on = lit({ kind: "bit", bit, inverted: false })[s.key][i];
          const off = lit({ kind: "bit", bit, inverted: true })[s.key][i];
          expect(on + off).toBe(1);
          code |= on << bit;
        }
        read[s.key].push(code);
      }
    expect(read).toEqual({ "a-roof": [1, 2, 3, 4], "b-porch": [5, 6, 7] });
  });

  it("lights at the display's brightness", () => {
    const out = renderPattern(strings, { kind: "all" }, 0.5, new Map());
    expect(out.get("a-roof")?.[0]).toBe(128);
    const off = renderPattern(strings, { kind: "all" }, 0, new Map());
    expect([...(off.get("a-roof") ?? [])].every((v) => v === 0)).toBe(true);
  });

  it("reuses buffers and renders again only when something changes", () => {
    const frames = new MappingFrames();
    const first = frames.get(strings, { kind: "all" }, 1).get("a-roof");
    const again = frames.get(strings, { kind: "all" }, 1).get("a-roof");
    expect(again).toBe(first);
    frames.get(strings, { kind: "off" }, 1);
    expect(first?.[0]).toBe(0);
  });
});

describe("MappingAcker", () => {
  const sent = (key: string) => ({ key, outcome: "sent" as const });

  it("acks a seq after its first frame reaches every live string", () => {
    const acker = new MappingAcker();
    expect(acker.frameSent(1, [sent("a"), sent("b")])).toEqual({
      seq: 1,
      missed: [],
    });
    // Once per seq.
    expect(acker.frameSent(1, [sent("a"), sent("b")])).toBeNull();
  });

  it("doesn't wait for offline strings, but says they missed it", () => {
    const acker = new MappingAcker();
    expect(
      acker.frameSent(4, [sent("a"), { key: "b", outcome: "unreachable" }]),
    ).toEqual({ seq: 4, missed: ["b"] });
  });

  it("retries a live string whose send failed, then gives up on it", () => {
    const acker = new MappingAcker();
    const failing = [sent("a"), { key: "b", outcome: "failed" as const }];
    for (let i = 1; i < MAX_ACK_ATTEMPTS; i++)
      expect(acker.frameSent(2, failing)).toBeNull();
    expect(acker.frameSent(2, failing)).toEqual({ seq: 2, missed: ["b"] });
  });

  it("a frame that went out after a failure acks with nothing missed", () => {
    const acker = new MappingAcker();
    expect(
      acker.frameSent(2, [{ key: "a", outcome: "busy" }, sent("b")]),
    ).toBeNull();
    expect(acker.frameSent(2, [sent("a"), sent("b")])).toEqual({
      seq: 2,
      missed: [],
    });
  });

  it("ignores stale frames and seqs the server already has", () => {
    const acker = new MappingAcker();
    acker.alreadyShown(5);
    expect(acker.frameSent(5, [sent("a")])).toBeNull();
    expect(acker.frameSent(6, [{ key: "a", outcome: "busy" }])).toBeNull();
    expect(acker.frameSent(5, [sent("a")])).toBeNull();
    expect(acker.frameSent(6, [sent("a")])?.seq).toBe(6);
  });

  it("sends an ack again when the last one didn't reach Convex", () => {
    const acker = new MappingAcker();
    acker.frameSent(3, [sent("a")]);
    acker.forget(3);
    expect(acker.frameSent(3, [sent("a")])?.seq).toBe(3);
  });
});
