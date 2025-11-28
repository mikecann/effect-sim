import type { SequenceTrackUIModel } from "../../models/SequenceTrackUIModel";
import { EVENT_BAR_STYLES } from "./EventBarStyles";
import { EventBarLabel } from "./EventBarLabel";

export function DraggingEventPreview({
  track,
}: {
  track: SequenceTrackUIModel;
}) {
  const draggedEventUI = track.draggedEventUI;
  const dragPreview = draggedEventUI?.dragPreview;

  if (!dragPreview) return null;

  return (
    <div
      style={{
        ...EVENT_BAR_STYLES.container(
          dragPreview.startFrame * track.frameWidth,
          (dragPreview.endFrame - dragPreview.startFrame) * track.frameWidth,
          false,
          true,
          false,
        ),
        opacity: 0.7,
        pointerEvents: "none",
      }}
      data-role="event-preview"
    >
      <EventBarLabel event={draggedEventUI} />
    </div>
  );
}

