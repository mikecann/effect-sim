import { createContext, useContext } from "react";
import { SequencerPanelUIModel } from "./models/SequencerPanelUIModel";
import { SequenceUIModel } from "./models/SequenceUIModel";
import { ensure } from "../../shared/ensure";

export const SequencerContext = createContext<SequencerPanelUIModel | null>(null);

export function useSequencerPanel(): SequencerPanelUIModel {
  const ctx = useContext(SequencerContext);
  if (!ctx)
    throw new Error("useSequencer must be used within SequencerProvider");
  return ctx;
}

export function useSequence(): SequenceUIModel {
  const panel = useSequencerPanel();
  return ensure(panel.sequence, "No sequence selected");
}
