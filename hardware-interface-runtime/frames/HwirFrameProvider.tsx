import { useEffect, useMemo, type ReactNode } from "react";
import { Signal } from "../../shared/Signal";
import {
  FrameContext,
  type FrameContextValue,
} from "../../src/common/FixedFrameProvider";
import { FrameClock, type FpsMeter } from "./FrameClock";

/**
 * HWIR's stand-in for the editor's FrameProvider: same context, so effects
 * and useFrame work unchanged, but timed with FrameClock (on the frame
 * interval, catch-up capped) instead of requestAnimationFrame.
 */
export const HwirFrameProvider = ({
  fps,
  meter,
  children,
}: {
  fps: number;
  meter: FpsMeter;
  children: ReactNode;
}) => {
  const clampedFps = fps > 0 ? fps : 60;
  const frameMs = 1000 / clampedFps;
  const signal = useMemo(() => new Signal(), []);

  useEffect(() => {
    const clock = new FrameClock(frameMs);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      const now = performance.now();
      const frames = clock.due(now);
      for (let i = 0; i < frames; i++) {
        signal.dispatch();
        meter.frame(now);
      }
      timer = setTimeout(tick, clock.delay(performance.now()));
    };
    tick();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [frameMs, signal, meter]);

  const value = useMemo<FrameContextValue>(
    () => ({ signal, fps: clampedFps, frameMs }),
    [signal, clampedFps, frameMs],
  );

  return (
    <FrameContext.Provider value={value}>{children}</FrameContext.Provider>
  );
};
