import { createContext, useContext, useMemo, useRef, useEffect } from "react";
import { SequenceRuntimeModel } from "./SequenceRuntimeModel";

export const SequenceRuntimeContext =
  createContext<SequenceRuntimeModel | null>(null);

export function useSequenceRuntime(): SequenceRuntimeModel {
  const ctx = useContext(SequenceRuntimeContext);
  if (!ctx)
    throw new Error(
      "useSequenceRuntime must be used within SequenceRuntimeProvider",
    );
  return ctx;
}
