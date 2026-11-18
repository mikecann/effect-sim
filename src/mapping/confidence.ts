import type { LedSource } from "./projectLeds";

// One colour scheme for how sure the mapping is about an LED, used on the
// photo's dots, the proposed LEDs on the house and the panel's legend.

export const confidenceColors = {
  sure: "#3ddc84",
  unsure: "#ffcc33",
  filled: "#ff5c5c",
} as const;

/** The colour for an LED found with this confidence (0..1). */
export const colorForConfidence = (confidence: number) =>
  confidence >= 0.8
    ? confidenceColors.sure
    : confidence >= 0.3
      ? confidenceColors.unsure
      : confidenceColors.filled;

export const colorForSource = (source: LedSource | undefined) =>
  source?.kind === "seen"
    ? colorForConfidence(source.confidence)
    : confidenceColors.filled;
