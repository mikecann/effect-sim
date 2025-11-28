import { EVENT_BAR_STYLES } from "../../tracks/eventBar/EventBarStyles";
import { EventBarLabel } from "../../tracks/eventBar/EventBarLabel";
import type { GhostTrackUIModel } from "../../models/GhostTrackUIModel";

export function GhostTrackGhostEvent({
  ghostTrack,
}: {
  ghostTrack: GhostTrackUIModel;
}) {
  const draggingEvent = ghostTrack.sequenceUI.draggingEvent;

  if (!ghostTrack.isTarget || !draggingEvent || !ghostTrack.dragPreview)
    return null;

  return (
    <div
      style={{
        ...EVENT_BAR_STYLES.container(
          ghostTrack.dragPreview.startFrame * ghostTrack.frameWidth,
          (ghostTrack.dragPreview.endFrame -
            ghostTrack.dragPreview.startFrame) *
            ghostTrack.frameWidth,
          false,
          true,
          false,
        ),
        position: "absolute",
        top: ghostTrack.y,
        opacity: 0.7,
        pointerEvents: "none",
      }}
      data-role="event-preview-ghost"
    >
      <EventBarLabel event={draggingEvent} />
    </div>
  );
}
