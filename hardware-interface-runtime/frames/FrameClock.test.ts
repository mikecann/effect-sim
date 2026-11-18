import { describe, expect, it } from "vitest";
import { FpsMeter, FrameClock, MAX_CATCH_UP } from "./FrameClock";

describe("FrameClock", () => {
  it("runs one frame per interval, waiting until the next one is due", () => {
    const clock = new FrameClock(25);
    expect(clock.due(0)).toBe(1);
    expect(clock.delay(0)).toBe(25);
    expect(clock.due(10)).toBe(0);
    expect(clock.delay(10)).toBe(15);
    expect(clock.due(25)).toBe(1);
    expect(clock.due(51)).toBe(1);
    expect(clock.delay(51)).toBe(24); // keeps its phase: next at 75
  });

  it(`catches up at most ${MAX_CATCH_UP} frames after a stall, dropping the rest`, () => {
    const clock = new FrameClock(25);
    clock.due(0);
    expect(clock.due(1_000)).toBe(MAX_CATCH_UP); // 40 frames were due
    expect(clock.dropped).toBe(40 - MAX_CATCH_UP);
    // And then it's back on the beat, not racing.
    expect(clock.due(1_001)).toBe(0);
    expect(clock.due(1_025)).toBe(1);
  });

  it("runs a frame that's slightly late without dropping anything", () => {
    const clock = new FrameClock(25);
    clock.due(0);
    expect(clock.due(30)).toBe(1);
    expect(clock.due(55)).toBe(1);
    expect(clock.dropped).toBe(0);
  });
});

describe("FpsMeter", () => {
  it("measures frames per second over its window", () => {
    const meter = new FpsMeter(1_000);
    expect(meter.fps(0)).toBeNull();
    for (let t = 0; t <= 1_000; t += 50) meter.frame(t); // every 50 ms
    expect(meter.fps(1_000)).toBeCloseTo(20, 5);
  });

  it("says 0 once frames stop", () => {
    const meter = new FpsMeter(1_000);
    for (let t = 0; t <= 1_000; t += 25) meter.frame(t);
    expect(meter.fps(1_500)).toBeGreaterThan(0);
    expect(meter.fps(5_000)).toBe(0);
  });
});
