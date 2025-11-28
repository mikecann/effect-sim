import { useEffect } from "react";
import { useFixedFrameContext } from "../FixedFrameProvider";

export type FixedFrameCallback = () => void;

export function useFrame(callback: FixedFrameCallback, deps?: unknown[]) {
  const { signal } = useFixedFrameContext();
  useEffect(() => signal.add(callback), [signal, callback, ...(deps ?? [])]);
}
