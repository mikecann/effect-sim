import { describe, expect, it } from "vitest";
import { createElement, StrictMode } from "react";
import { render } from "react-nil";
import { makeAutoObservable, runInAction } from "mobx";
import {
  EffectScopeContext,
  FrameCatchUp,
  framesToRun,
  MAX_REPLAY_FRAMES,
  SLICE_FRAMES,
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
    expect(framesToRun(null, 3, 100)).toEqual({ from: 0, to: 3 });
    expect(framesToRun(3, 3, 100)).toBeNull();
    expect(framesToRun(3, 4, 100)).toEqual({ from: 4, to: 4 });
    expect(framesToRun(3, 6, 100)).toEqual({ from: 4, to: 6 });
    expect(framesToRun(6, 2, 100)).toEqual({ from: 0, to: 2 });
    // Never past the event's last frame.
    expect(framesToRun(null, 120, 100)).toEqual({ from: 0, to: 100 });
    expect(framesToRun(100, 101, 100)).toBeNull();
    // A replay goes back at most MAX_REPLAY_FRAMES.
    expect(framesToRun(null, 900_000, 1_000_000)).toEqual({
      from: 900_000 - MAX_REPLAY_FRAMES,
      to: 900_000,
    });
  });

  it("replays several effects frame by frame in playing order", async () => {
    // Playhead at 10: one event started at 0, one at 5, one starts now.
    const catchUp = new FrameCatchUp(() => 10);
    const ran: string[] = [];
    const add = (name: string, effectFrame: number) =>
      catchUp.add(effectFrame, 0, effectFrame, (f) => ran.push(`${name}${f}`));
    add("starting", 0);
    add("a", 10);
    add("b", 5);
    await settle();
    expect(ran).toHaveLength(11 + 6 + 1);
    // At frame 5, a's sixth frame runs before b's first (b mounts then).
    expect(ran.indexOf("a5")).toBeLessThan(ran.indexOf("b0"));
    // Later frames go in sequence order: a before b, frame by frame.
    expect(ran.indexOf("a6")).toBeLessThan(ran.indexOf("b1"));
    expect(ran.indexOf("b1")).toBeLessThan(ran.indexOf("a7"));
    // The event starting now runs its first frame last.
    expect(ran.slice(-3)).toEqual(["a10", "b5", "starting0"]);
  });

  it("catches up in short slices, so a huge replay never blocks a tick", async () => {
    const slices: Array<() => void> = [];
    const catchUp = new FrameCatchUp(
      () => 900_000,
      (slice) => slices.push(slice),
    );
    let ran = 0;
    const window = framesToRun(null, 900_000, 1_000_000);
    if (!window) throw new Error("expected frames to run");
    const handle = catchUp.add(900_000, window.from, window.to, () => ran++);
    // The first slice runs once the mounting effects are in, and no more.
    await settle();
    expect(ran).toBe(SLICE_FRAMES);
    // New frames for the effect wait behind its replay.
    handle.extendTo(900_002);
    let most = 0;
    while (slices.length > 0) {
      const before = ran;
      slices.shift()?.();
      most = Math.max(most, ran - before);
    }
    expect(most).toBeLessThanOrEqual(SLICE_FRAMES);
    expect(ran).toBe(MAX_REPLAY_FRAMES + 1 + 2);
    expect(handle.done).toBe(true);
  });

  it("keeps running under StrictMode's setup, cleanup, setup", async () => {
    const string = new PreviewString();
    const timing = new Timing();
    const scope = { timing, target: string.key };
    const effect = stringEffects.find((e) => e.id === "comet");
    if (!effect) throw new Error("no comet");
    render(
      createElement(
        StrictMode,
        null,
        createElement(
          EffectScopeContext.Provider,
          { value: scope },
          createElement(effect.Run, { string, rawProps: effect.defaults }),
        ),
      ),
    );
    await settle();
    for (let frame = 1; frame <= 30; frame++) {
      runInAction(() => timing.setFrame(frame));
      await settle();
    }
    // The comet has moved half way along: its head is lit.
    const head = Math.floor((30 / DURATION) * string.ledCount);
    expect(string.getPixel(head)).toEqual([255, 255, 255]);
    render(null);
    await settle();
  });

  describe("paused on a scrubbed-to frame, with the runtime's catch-up", () => {
    const mountAt = async (
      effectId: string,
      frame: number,
      { strict = true, rerenders = 0 } = {},
    ) => {
      const effect = stringEffects.find((e) => e.id === effectId);
      if (!effect) throw new Error(`no ${effectId}`);
      const string = new PreviewString();
      const timing = new Timing();
      timing.setFrame(frame);
      const scope = {
        timing,
        target: string.key,
        catchUp: new FrameCatchUp(() => timing.effectFrame),
      };
      const tree = () => {
        const inner = createElement(
          EffectScopeContext.Provider,
          { value: scope },
          createElement(effect.Run, {
            string,
            rawProps: { ...effect.defaults },
          }),
        );
        return strict ? createElement(StrictMode, null, inner) : inner;
      };
      render(tree());
      // Re-renders at the same frame before the queued replay has run.
      for (let i = 0; i < rerenders; i++) render(tree());
      await settle();
      const leds = Array.from(string.data);
      render(null);
      await settle();
      return leds;
    };

    it("lights a Set Color event at frame 50 under StrictMode", async () => {
      const leds = await mountAt("setColor", 50);
      expect(leds.every((v) => v === 255)).toBe(true);
    });

    it("keeps an unfinished replay through re-renders at the same frame", async () => {
      const leds = await mountAt("setColor", 50, { rerenders: 3 });
      expect(leds.every((v) => v === 255)).toBe(true);
    });

    it("gives a stateful effect the same LEDs as playing there", async () => {
      const played = await run(
        stringEffects.find((e) => e.id === "comet") ?? stringEffects[0],
        0,
        Array.from({ length: 30 }, (_, i) => i + 1),
      );
      expect(await mountAt("comet", 30)).toEqual(played.before);
    });
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
