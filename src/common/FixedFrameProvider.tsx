import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo } from "react";
import { Signal } from "../../shared/Signal";
import { observer } from "mobx-react-observer";

export type FrameContextValue = {
  signal: Signal;
  fps: number;
  frameMs: number;
};

const FrameContext = createContext<FrameContextValue | null>(null);

export const FrameProvider = observer(
  ({ children, fps = 60 }: { children: ReactNode; fps?: number }) => {
    const clampedFps = fps > 0 ? fps : 60;
    const frameMs = 1000 / clampedFps;

    // Stable signal instance
    const signal = useMemo(() => new Signal(), []);

    useEffect(() => {
      let rafId = 0;
      let lastTimestamp: number | null = null;
      let accumulatedMs = 0;
      let stopped = false;

      const tick = (timestamp: number) => {
        if (stopped) return;

        if (lastTimestamp === null) lastTimestamp = timestamp;
        else {
          const deltaMs = timestamp - lastTimestamp;
          lastTimestamp = timestamp;
          accumulatedMs += deltaMs;

          if (accumulatedMs >= frameMs) {
            const framesToAdvance = Math.floor(accumulatedMs / frameMs);
            accumulatedMs -= framesToAdvance * frameMs;

            for (let i = 0; i < framesToAdvance; i++) signal.dispatch();
          }
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
      return () => {
        stopped = true;
        if (rafId) cancelAnimationFrame(rafId);
      };
    }, [frameMs, signal]);

    const value = useMemo<FrameContextValue>(
      () => ({ signal, fps: clampedFps, frameMs }),
      [signal, clampedFps, frameMs],
    );

    return (
      <FrameContext.Provider value={value}>{children}</FrameContext.Provider>
    );
  },
);

export function useFrameContext(): FrameContextValue {
  const ctx = useContext(FrameContext);
  if (!ctx)
    throw new Error("useFrameContext must be used within FrameProvider");
  return ctx;
}
