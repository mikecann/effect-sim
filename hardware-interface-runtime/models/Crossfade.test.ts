import { describe, expect, it } from "vitest";
import { Crossfade } from "./Crossfade";
import type { NodeKey } from "../../shared/models/docs";

const key = "a" as NodeKey;
const send = (fade: Crossfade, current: number[], factor = 1) => {
  const out = fade.mix(
    key,
    Uint8Array.from(current),
    factor,
    new Uint8Array(current.length),
  );
  fade.frameSent();
  return Array.from(out);
};

describe("Crossfade", () => {
  it("passes frames straight through when nothing is fading", () => {
    const fade = new Crossfade();
    expect(fade.active).toBe(false);
    expect(send(fade, [10, 200, 0])).toEqual([10, 200, 0]);
  });

  it("fades from the old frame to the new over the given frames, then stops", () => {
    const fade = new Crossfade();
    fade.begin([{ key, data: Uint8Array.from([200, 0, 0]) }], 3);
    expect(fade.active).toBe(true);
    // A quarter, half, three quarters of the way to the new frame.
    expect(send(fade, [0, 200, 0])).toEqual([150, 50, 0]);
    expect(send(fade, [0, 200, 0])).toEqual([100, 100, 0]);
    expect(send(fade, [0, 200, 0])).toEqual([50, 150, 0]);
    expect(fade.active).toBe(false);
    expect(send(fade, [0, 200, 0])).toEqual([0, 200, 0]);
  });

  it("dims the mix by the display's brightness", () => {
    const fade = new Crossfade();
    fade.begin([{ key, data: Uint8Array.from([200]) }], 1);
    expect(send(fade, [0], 0.5)).toEqual([50]);
  });

  it("keeps its own copy of the old frame", () => {
    const fade = new Crossfade();
    const old = Uint8Array.from([200]);
    fade.begin([{ key, data: old }], 1);
    old[0] = 0;
    expect(send(fade, [0])).toEqual([100]);
  });

  it("shows the new frame alone on a string the old frame didn't have", () => {
    const fade = new Crossfade();
    fade.begin([{ key: "b" as NodeKey, data: Uint8Array.from([200]) }], 2);
    expect(send(fade, [80])).toEqual([80]);
  });
});
