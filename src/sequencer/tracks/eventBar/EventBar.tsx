import type { TrackEventUIModel } from "../../models/TrackEventUIModel";
import { useSequence } from "../../SequencerContext";
import { useApp } from "../../../common/AppContext";
import { EventBarResizeHandles } from "./EventBarResizeHandles";
import { EventBarLabel } from "./EventBarLabel";
import { EventBarOutOfBoundsOverlay } from "./EventBarOutOfBoundsOverlay";
import { EventBarDragHandler } from "./EventBarDragHandler";
import { EVENT_BAR_STYLES } from "./EventBarStyles";

export function EventBar({ event }: { event: TrackEventUIModel }) {
  const appModel = useApp();
  const sequence = useSequence();

  return (
    <>
      <div
        style={{
          ...EVENT_BAR_STYLES.container(
            event.pxLeft,
            event.pxWidth,
            event.isCompletelyOutOfBounds,
            event.isDragging,
            event.isSelected,
          ),
          // Hide when dragged to another track (ghost will show in target track)
          opacity: event.isDraggedToOtherTrack ? 0 : undefined,
          pointerEvents: event.isDraggedToOtherTrack ? "none" : undefined,
          // Show red when overlapped by dragged event
          ...(event.isOverlapped
            ? {
                background: "var(--mantine-color-red-7)",
                borderColor: "var(--mantine-color-red-5)",
              }
            : {}),
        }}
        data-role="event"
        onMouseDown={(e) => {
          e.stopPropagation();
          event.startDrag("move", e.clientX);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (event.isSelected) appModel.setSelectedEntity(null);
          else
            appModel.setSelectedEntity({
              kind: "event",
              event: event.event,
              sequence: sequence.sequence,
            });
        }}
      >
        <EventBarResizeHandles event={event} />

        <EventBarLabel event={event} />

        <EventBarOutOfBoundsOverlay event={event} />
      </div>

      <EventBarDragHandler event={event} />
    </>
  );
}
