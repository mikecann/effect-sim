// When HWIR runs a frame. Frames are scheduled on the project's frame
// interval (not a fixed 16 ms tick). After a stall (a GC pause, a busy Mac),
// it runs at most MAX_CATCH_UP frames to catch up and drops the rest, so the
// show skips ahead instead of racing through a burst of frames.

export const MAX_CATCH_UP = 2;

/** A bad framerate (0, negative, NaN, Infinity) can never make frames run unbounded. */
export const safeFps = (fps: number) =>
  Number.isFinite(fps) && fps > 0 ? Math.min(Math.max(fps, 1), 120) : 60;

export class FrameClock {
  private nextAt: number | null = null;
  /** Frames skipped after stalls, since the clock started. */
  dropped = 0;

  readonly frameMs: number;

  constructor(
    frameMs: number,
    private readonly maxCatchUp = MAX_CATCH_UP,
  ) {
    // Never 0, NaN or Infinity, whatever the project says (1 to 1000 ms).
    this.frameMs = Number.isFinite(frameMs)
      ? Math.min(Math.max(frameMs, 1), 1000)
      : 1000 / 60;
  }

  /** How many frames to run now (0 to maxCatchUp). */
  due(now: number): number {
    if (this.nextAt === null) {
      this.nextAt = now + this.frameMs;
      return 1;
    }
    if (now < this.nextAt) return 0;
    const behind = Math.floor((now - this.nextAt) / this.frameMs) + 1;
    this.nextAt += behind * this.frameMs;
    const run = Math.min(behind, this.maxCatchUp);
    this.dropped += behind - run;
    return run;
  }

  /** How long to wait before calling `due` again. */
  delay(now: number): number {
    return this.nextAt === null ? 0 : Math.max(0, this.nextAt - now);
  }
}

/** Frames really run per second, over the last few seconds. */
export class FpsMeter {
  private windowStart: number | null = null;
  private count = 0;
  private measured: number | null = null;

  constructor(private readonly windowMs = 5_000) {}

  frame(now: number) {
    // Counts frames after the window's first, so N intervals read as N.
    if (this.windowStart === null) {
      this.windowStart = now;
      return;
    }
    this.count++;
    const elapsed = now - this.windowStart;
    if (elapsed < this.windowMs) return;
    this.measured = (this.count * 1000) / elapsed;
    this.windowStart = now;
    this.count = 0;
  }

  /** Null until a whole window has passed (or with no frames at all). */
  fps(now: number): number | null {
    // Frames stopped: don't keep reporting the old rate.
    if (this.windowStart !== null && now - this.windowStart > this.windowMs * 2)
      return 0;
    return this.measured;
  }
}
