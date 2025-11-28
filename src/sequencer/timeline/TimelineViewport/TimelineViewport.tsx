import { useRef, useEffect } from "react";
import { Box } from "@mantine/core";
import TimelineRuler from "../TimelineRuler";
import { useSequence } from "../../SequencerContext";
import { TrackContextMenu } from "../TrackContextMenu";
import { TimelineTracksArea } from "./TimelineTracksArea";
import { PanningController } from "./PanningController";
import { useElementEvent } from "../../../common/utils/useElementEvent";
import { useWindowEvent } from "../../../common/utils/useWindowEvent";

export default function TimelineViewport() {
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const sequence = useSequence();

  useEffect(() => {
    sequence.setContainerRef(timelineScrollRef);
  }, [sequence]);

  useElementEvent(
    timelineScrollRef,
    "wheel",
    (event: WheelEvent) => {
      const container = timelineScrollRef.current;
      if (!container) return;
      sequence.handleWheel(container, event);
    },
    { passive: false },
  );

  useWindowEvent("keydown", (event) => sequence.handleKeyDown(event));

  return (
    <>
      {sequence.isPanning && (
        <PanningController containerRef={timelineScrollRef} />
      )}
      <Box
        ref={timelineScrollRef}
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          if (sequence.isDragging) return;

          const target = event.target as HTMLElement | null;
          if (target && target.closest('[data-role="event"]')) return;

          const container = timelineScrollRef.current;
          if (!container) return;

          sequence.startPanning(container, event);
        }}
        style={{
          position: "relative",
          overflow: "auto",
          cursor: sequence.cursor,
        }}
      >
        <TimelineRuler />
        <TimelineTracksArea />
        <TrackContextMenu />
      </Box>
    </>
  );
}
