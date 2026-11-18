import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { autorun, runInAction, untracked } from "mobx";
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

/**
 * Lines up the replays of several effects frame by frame, as playing would
 * have run them, so effects sharing a string (one fading what another lit)
 * end the same either way. The sequence runtime gives one to its effects.
 */
export class FrameCatchUp {
  private tasks: Array<{
    start: number;
    frames: number[];
    run: (frame: number) => void;
  }> = [];

  /** `now` is the playhead's frame, which places each event in time. */
  constructor(private readonly now: () => number) {}

  /** Queues an effect's frames; they all run together once the effects mounting now are in. */
  add(effectFrame: number, frames: number[], run: (frame: number) => void) {
    if (this.tasks.length === 0) queueMicrotask(() => this.flush());
    this.tasks.push({ start: this.now() - effectFrame, frames, run });
  }

  private flush() {
    const tasks = this.tasks;
    this.tasks = [];
    const steps = tasks.flatMap((task, order) =>
      task.frames.map((frame) => ({
        at: task.start + frame,
        order,
        frame,
        task,
      })),
    );
    // In playing order: by frame; within a frame, effects already running
    // first (in the order they sit in the sequence, as a re-render
    // recreates their frame handlers in that order), then events starting
    // on that frame, which mount after the playhead reaches it.
    steps.sort(
      (a, b) =>
        a.at - b.at ||
        Number(a.frame === 0) - Number(b.frame === 0) ||
        a.order - b.order,
    );
    // In one action, as a frame's autoruns would be, so the strings' computed
    // values (a virtual string's pixels) are worked out once, not per LED.
    runInAction(() => {
      for (const step of steps) step.task.run(step.frame);
    });
  }
}

/** An effect running on one string. */
export type EffectScope = {
  timing: EffectTiming;
  target: string;
  /** Without one, a replay runs straight through (an effect on its own). */
  catchUp?: FrameCatchUp;
};

export const EffectScopeContext = createContext<EffectScope | null>(null);

const useEffectScope = (): EffectScope => {
  const scope = useContext(EffectScopeContext);
  if (!scope)
    throw new Error("An effect must run inside an EffectScopeContext.");
  return scope;
};

/** Where the event is in time, e.g. its loop count for set-up code. In a frame handler, use the frame passed in. */
export const useEffectTiming = (): EffectTiming => useEffectScope().timing;

/** One frame of an event, as a frame handler sees it. */
export type EffectFrame = {
  /** Frames since the event started. */
  frame: number;
  /** 0 at the event's start to 1 at its end. */
  ratio: number;
  loopCount: number;
  /** Seeded by the event, the string, the frame and the loop. */
  random: Random;
};

const frameOf = (
  timing: EffectTiming,
  target: string,
  frame: number,
  loopCount: number,
): EffectFrame => ({
  frame,
  ratio:
    timing.duration > 0 ? Math.min(1, Math.max(0, frame / timing.duration)) : 0,
  loopCount,
  random: createRandom(hashSeed(timing.seed, target, frame, loopCount)),
});

/** Which frames to run to bring an effect from the last frame it ran up to `frame`. */
export const framesToRun = (last: number | null, frame: number): number[] => {
  // The same frame again (a re-render made a new handler): nothing to do.
  if (last === frame) return [];
  // The next frames: run each one, so a dropped frame still counts.
  // Starting, or going back (a new loop, or a jump): replay from the event's
  // start, so landing on a frame gives what playing up to it would.
  const from = last !== null && last < frame ? last + 1 : 0;
  return Array.from({ length: frame - from + 1 }, (_, i) => from + i);
};

/**
 * Runs `handler` once for every frame of the event, in order, and never
 * twice for the same frame. An effect that starts part-way through (the
 * playhead jumped there) replays from the event's start first, so its state
 * and the LEDs it leaves are what playing up to that frame gives; on a jump
 * back the runtime remounts effects (fresh state) and clears the LEDs
 * (src/sequencer/runtime/SequenceRuntime.tsx). Read time from the frame
 * passed in, not useEffectTiming, so a replay sees each frame's own.
 */
export function useEffectFrame(handler: (frame: EffectFrame) => void): void {
  const { timing, target, catchUp } = useEffectScope();
  const last = useRef<number | null>(null);
  // A replay queued before the effect unmounted (the runtime starting over)
  // must not write to the LEDs after it's gone.
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  useEffect(
    () =>
      autorun(() => {
        const frame = timing.effectFrame;
        // Read, not followed: a new loop shows up as the frame going back.
        const loopCount = untracked(() => timing.loopCount);
        // An event's last frame is its duration; one replayed after it
        // ended (a jump past it) stops there, as playing would have.
        const starting = last.current === null;
        const frames = framesToRun(last.current, frame).filter(
          (f) => f <= timing.duration,
        );
        last.current = frame;
        const run = (f: number) => {
          if (mounted.current) handler(frameOf(timing, target, f, loopCount));
        };
        // A replay, or an effect just mounting, waits for the others
        // mounting with it, so they all run in playing order.
        if ((frames.length > 1 || starting) && catchUp)
          catchUp.add(frame, frames, run);
        else frames.forEach(run);
      }),
    [timing, target, catchUp, handler],
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
