import { createContext, useCallback, useContext, useEffect } from "react";
import { autorun } from "mobx";
import type { Bounds, Point3 } from "../geometry/stringLayout";
import { createRandom, hashSeed, type Random } from "../random";

// What an effect sees: the string it lights, where the event is in time, and
// seeded random numbers. Effects are React components (shared/effects/string,
// made with defineEffect) that the editor and HWIR both run.

/** A string, real or virtual, as an effect lights it. */
export interface EffectString {
  key: string;
  ledCount: number;
  setPixel(index: number, r: number, g: number, b: number): void;
  setAllPixels(r: number, g: number, b: number): void;
  getPixel(index: number): [number, number, number];
  clear(): void;
  multiplyAll(byValue: number): void;
  /** Where LED `index` is on the house, in metres. */
  getPosition(index: number): Point3;
  /** Where LED `index` is among all the house's LEDs (`bounds`), 0..1 on each axis. */
  getNormalisedPosition(index: number): Point3;
  /** The box around every LED on the house, in metres. */
  bounds: Bounds;
}

/** Where an event is in time. */
export interface EffectTiming {
  /** Frames since the event started. */
  effectFrame: number;
  /** 0 at the event's start to 1 at its end. */
  effectPlaybackRatio: number;
  /** How many times the sequence has looped. */
  loopCount: number;
  /** The event's length in frames. */
  duration: number;
  /** The event's seed: the same every time it plays. */
  seed: number;
}

/** An effect running on one string. */
export type EffectScope = { timing: EffectTiming; target: string };

export const EffectScopeContext = createContext<EffectScope | null>(null);

const useEffectScope = (): EffectScope => {
  const scope = useContext(EffectScopeContext);
  if (!scope)
    throw new Error("An effect must run inside an EffectScopeContext.");
  return scope;
};

/** Where the event is in time. Read it inside a frame handler to follow it. */
export const useEffectTiming = (): EffectTiming => useEffectScope().timing;

/**
 * Runs `handler` on every frame of the event. `random` is seeded by the
 * event, the string, the frame and the loop, so a frame always draws the same
 * numbers however the playhead got there.
 */
export function useEffectFrame(
  handler: (frame: number, random: Random) => void,
): void {
  const { timing, target } = useEffectScope();
  useEffect(
    () =>
      autorun(() => {
        const frame = timing.effectFrame;
        handler(
          frame,
          createRandom(hashSeed(timing.seed, target, frame, timing.loopCount)),
        );
      }),
    [timing, target, handler],
  );
}

/**
 * Seeded random numbers outside a frame, e.g. to set an effect up when a loop
 * starts: `randomFor("balls", loopCount)` gives the same run every time.
 */
export function useEffectRandom(): (...salt: Array<string | number>) => Random {
  const { timing, target } = useEffectScope();
  return useCallback(
    (...salt: Array<string | number>) =>
      createRandom(hashSeed(timing.seed, target, ...salt)),
    [timing, target],
  );
}
