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
 * At most this many frames are replayed when an effect starts part-way
 * through (about 10 s at 120 fps): further back, its state is approximate.
 */
export const MAX_REPLAY_FRAMES = 1200;

/**
 * How many effect frames one slice of catching up runs before the rest waits
 * for a later tick: a count, not a time, so a replay comes out the same
 * however busy the machine is. One effect frame on a 200-LED string is a few
 * microseconds, so a slice stays around a millisecond.
 */
export const SLICE_FRAMES = 120;

type CatchUpTask = {
  /** The playhead frame the event started on. */
  start: number;
  /** The next of its frames to run, and the last. */
  next: number;
  to: number;
  run: (frame: number) => void;
  /** When it was added: the order the effects sit in the sequence. */
  order: number;
  cancelled: boolean;
};

/** An effect's place in a catch-up: more frames can join it, or it can be dropped. */
export type CatchUpHandle = {
  readonly done: boolean;
  extendTo(frame: number): void;
  cancel(): void;
};

/**
 * Lines up the replays of several effects frame by frame, as playing would
 * have run them, so effects sharing a string (one fading what another lit)
 * end the same either way. It works in slices of SLICE_FRAMES, carrying on
 * in later ticks, so a long replay never stalls HWIR's frame loop; an effect
 * still catching up queues its new frames here rather than running ahead.
 * The sequence runtime gives one to its effects.
 */
export class FrameCatchUp {
  private tasks: CatchUpTask[] = [];
  private added = 0;
  private scheduled = false;

  /** `now` is the playhead's frame, which places each event in time. */
  constructor(
    private readonly now: () => number,
    private readonly later: (slice: () => void) => void = (slice) =>
      setTimeout(slice, 0),
  ) {}

  /** Queues frames `from` to `to` of an effect now at `effectFrame`. */
  add(
    effectFrame: number,
    from: number,
    to: number,
    run: (frame: number) => void,
  ): CatchUpHandle {
    const task: CatchUpTask = {
      start: this.now() - effectFrame,
      next: from,
      to,
      run,
      order: this.added++,
      cancelled: false,
    };
    this.tasks.push(task);
    if (!this.scheduled) {
      this.scheduled = true;
      // The first slice runs once the effects mounting now are all in.
      queueMicrotask(() => this.slice());
    }
    return {
      get done() {
        return task.cancelled || task.next > task.to;
      },
      extendTo: (frame) => {
        task.to = Math.max(task.to, frame);
      },
      cancel: () => {
        task.cancelled = true;
      },
    };
  }

  /** Whether `a` comes before `b` when playing: by frame, then effects already running, then in sequence order. */
  private static before(a: CatchUpTask, b: CatchUpTask) {
    const at = a.start + a.next - (b.start + b.next);
    if (at !== 0) return at < 0;
    const starting = Number(a.next === 0) - Number(b.next === 0);
    if (starting !== 0) return starting < 0;
    return a.order < b.order;
  }

  private slice() {
    // In one action, as a frame's autoruns would be, so the strings' computed
    // values (a virtual string's pixels) are worked out once, not per LED.
    runInAction(() => {
      for (let ran = 0; ran < SLICE_FRAMES; ran++) {
        let first: CatchUpTask | null = null;
        for (const task of this.tasks)
          if (!task.cancelled && task.next <= task.to)
            if (!first || FrameCatchUp.before(task, first)) first = task;
        if (!first) break;
        first.run(first.next);
        first.next++;
      }
    });
    this.tasks = this.tasks.filter((t) => !t.cancelled && t.next <= t.to);
    if (this.tasks.length > 0) this.later(() => this.slice());
    else this.scheduled = false;
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

/**
 * The frames to run to bring an effect from the last frame it ran up to
 * `frame` (and no further than its last, `duration`), or null for none.
 */
export const framesToRun = (
  last: number | null,
  frame: number,
  duration: number,
): { from: number; to: number } | null => {
  // The same frame again (a re-render made a new handler): nothing to do.
  if (last === frame) return null;
  // The next frames: run each one, so a dropped frame still counts.
  // Starting, or going back (a new loop, or a jump): replay from the event's
  // start, so landing on a frame gives what playing up to it would, up to
  // MAX_REPLAY_FRAMES back.
  const resume = last !== null && last < frame ? last + 1 : 0;
  const from = Math.max(resume, frame - MAX_REPLAY_FRAMES);
  const to = Math.min(frame, duration);
  return from <= to ? { from, to } : null;
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
  const pending = useRef<CatchUpHandle | null>(null);
  // A replay queued before the effect unmounted (the runtime starting over)
  // must not write to the LEDs after it's gone. Set again on every setup, as
  // StrictMode sets effects up, cleans them up and sets them up again.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () =>
      autorun(() => {
        const frame = timing.effectFrame;
        // Read, not followed: a new loop shows up as the frame going back.
        const loopCount = untracked(() => timing.loopCount);
        const run = (f: number) => {
          if (mounted.current) handler(frameOf(timing, target, f, loopCount));
        };
        const starting = last.current === null;
        const goingOn = last.current !== null && frame > last.current;
        // Still catching up: new frames queue behind the replay.
        if (goingOn && pending.current && !pending.current.done) {
          pending.current.extendTo(Math.min(frame, timing.duration));
          last.current = frame;
          return;
        }
        if (!goingOn) pending.current?.cancel();
        const frames = framesToRun(last.current, frame, timing.duration);
        last.current = frame;
        if (!frames) return;
        // A replay, or an effect just mounting, waits for the others
        // mounting with it, so they all run in playing order.
        if ((frames.to > frames.from || starting) && catchUp) {
          pending.current = catchUp.add(frame, frames.from, frames.to, run);
          return;
        }
        for (let f = frames.from; f <= frames.to; f++) run(f);
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
