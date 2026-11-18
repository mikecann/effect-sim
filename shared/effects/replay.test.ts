import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render } from "react-nil";
import { makeAutoObservable, runInAction } from "mobx";
import {
  EffectScopeContext,
  FrameCatchUp,
  framesToRun,
  type EffectTiming,
} from "./api";
import { stringEffects } from "./registry";
import type { StringEffect } from "./defineEffect";
import { hashSeed } from "../random";
import { PreviewString } from "../../src/sequencer/inspector/simulation/PreviewModels";

const DURATION = 60;

class Timing implements EffectTiming {
  effectFrame = 0;
  loopCount = 0;
  duration = DURATION;
  seed = hashSeed("replay-test");
  constructor() {
    makeAutoObservable(this);
  }
  get effectPlaybackRatio() {
    return Math.min(1, this.effectFrame / this.duration);
  }
  setFrame(frame: number) {
    this.effectFrame = frame;
  }
}

const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
};

/** Mounts an effect at `startAt`, then moves through `then`, and returns its LEDs. */
const run = async (
  effect: StringEffect,
  startAt: number,
  then: number[] = [],
  rerender = false,
) => {
  const string = new PreviewString();
  const timing = new Timing();
  timing.setFrame(startAt);
  const scope = { timing, target: string.key };
  const tree = (rawProps: unknown) =>
    createElement(
      EffectScopeContext.Provider,
      { value: scope },
      createElement(effect.Run, { string, rawProps }),
    );
  render(tree({ ...effect.defaults }));
  await settle();
  for (const frame of then) {
    runInAction(() => timing.setFrame(frame));
    await settle();
  }
  const before = Array.from(string.data);
  if (rerender) {
    // New props object, same values: a new handler for the same frame.
    render(tree({ ...effect.defaults }));
    await settle();
  }
  render(null);
  await settle();
  return { before, after: Array.from(string.data) };
};

describe("frames run once each, in order", () => {
  it("works out which frames to run", () => {
    expect(framesToRun(null, 3)).toEqual([0, 1, 2, 3]);
    expect(framesToRun(3, 3)).toEqual([]);
    expect(framesToRun(3, 4)).toEqual([4]);
    expect(framesToRun(3, 6)).toEqual([4, 5, 6]);
    expect(framesToRun(6, 2)).toEqual([0, 1, 2]);
  });

  it("replays several effects frame by frame in playing order", async () => {
    // Playhead at 10: one event started at 0, one at 5, one starts now.
    const catchUp = new FrameCatchUp(() => 10);
    const ran: string[] = [];
    const add = (name: string, effectFrame: number) =>
      catchUp.add(
        effectFrame,
        Array.from({ length: effectFrame + 1 }, (_, i) => i),
        (f) => ran.push(`${name}${f}`),
      );
    add("starting", 0);
    add("a", 10);
    add("b", 5);
    await settle();
    const at = (frame: number) =>
      ran.filter(
        (r) =>
          r === `a${frame}` ||
          r === `b${frame - 5}` ||
          (frame === 10 && r === "starting0"),
      );
    expect(ran).toHaveLength(11 + 6 + 1);
    // At frame 5, a's sixth frame runs before b's first (b mounts then).
    expect(ran.indexOf("a5")).toBeLessThan(ran.indexOf("b0"));
    // Later frames go in sequence order: a before b, frame by frame.
    expect(ran.indexOf("a6")).toBeLessThan(ran.indexOf("b1"));
    expect(ran.indexOf("b1")).toBeLessThan(ran.indexOf("a7"));
    // The event starting now runs its first frame last.
    expect(ran.at(-1)).toBe("starting0");
    expect(at(10)).toEqual(["a10", "b5", "starting0"]);
  });

  const target = 41;
  for (const effect of stringEffects)
    it(`${effect.id}: landing on a frame equals playing up to it, and a re-render changes nothing`, async () => {
      const played = await run(
        effect,
        0,
        Array.from({ length: target }, (_, i) => i + 1),
        true,
      );
      const landed = await run(effect, target);
      expect(landed.before).toEqual(played.before);
      expect(played.after).toEqual(played.before);
    });
});
