/* eslint-disable react-refresh/only-export-components */
import type {
  ReactNode} from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { Signal } from "../../shared/Signal";

export type FixedFrameEvent = {
  nowMs: number;
  deltaMs: number;
  frameIndex: number;
};

export type FixedFrameContextValue = {
  signal: Signal;
  frameMs: number;
};

const FixedFrameContext = createContext<FixedFrameContextValue | null>(null);

export function FixedFrameProvider({
  children,
  frameMs = 16,
}: {
  children: ReactNode;
  frameMs?: number;
}) {
  const clampedFrameMs = frameMs > 0 ? frameMs : 16;

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

        if (accumulatedMs >= clampedFrameMs) {
          const framesToAdvance = Math.floor(accumulatedMs / clampedFrameMs);
          accumulatedMs -= framesToAdvance * clampedFrameMs;

          for (let i = 0; i < framesToAdvance; i++)
            signal.dispatch();
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [clampedFrameMs, signal]);

  const value = useMemo<FixedFrameContextValue>(
    () => ({ signal, frameMs: clampedFrameMs }),
    [signal, clampedFrameMs],
  );

  return (
    <FixedFrameContext.Provider value={value}>
      {children}
    </FixedFrameContext.Provider>
  );
}

export function useFixedFrameContext(): FixedFrameContextValue {
  const ctx = useContext(FixedFrameContext);
  if (!ctx)
    throw new Error(
      "useFixedFrameContext must be used within FixedFrameProvider",
    );
  return ctx;
}
