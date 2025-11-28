import { createContext, useContext, useEffect, useMemo } from "react";
import { SequenceRuntimeEffectModel } from "../../sequencer/runtime/SequenceRuntimeEffectModel";

export const EffectContext = createContext<SequenceRuntimeEffectModel | null>(
  null,
);

export function useEffectContext(): SequenceRuntimeEffectModel {
  const ctx = useContext(EffectContext);
  if (!ctx)
    throw new Error("useEffectContext must be used within EffectProvider");
  return ctx;
}
