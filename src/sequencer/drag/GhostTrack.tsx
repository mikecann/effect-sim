import { ROW_HEIGHT } from "../sequencer";
import type { GhostTrackUIModel } from "../models/GhostTrackUIModel";

export function GhostTrack({ ghostTrack }: { ghostTrack: GhostTrackUIModel }) {
  const startFrame = 0;
  const endFrame = ghostTrack.sequenceNumFrames;
  const left = startFrame * ghostTrack.frameWidth;
  const width = (endFrame - startFrame) * ghostTrack.frameWidth;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top: ghostTrack.y,
        width,
        height: ROW_HEIGHT,
        backgroundColor: "var(--mantine-color-blue-6)",
        opacity: 0.15,
        border: "2px dashed rgba(99, 179, 237, 0.3)",
        pointerEvents: "none",
        zIndex: 1000,
      }}
    />
  );
}
