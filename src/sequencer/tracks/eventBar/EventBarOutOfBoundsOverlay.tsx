import type { TrackEventUIModel } from "../../models/TrackEventUIModel";
import { EVENT_BAR_STYLES } from "./EventBarStyles";

interface EventBarOutOfBoundsOverlayProps {
  event: TrackEventUIModel;
}

export function EventBarOutOfBoundsOverlay({
  event,
}: EventBarOutOfBoundsOverlayProps) {
  if (!event.isPartiallyOutOfBounds) return null;

  const sequenceNumFrames = event.trackUI.sequenceNumFrames;
  if (sequenceNumFrames === undefined) return null;

  const left =
    (sequenceNumFrames - event.displayStartFrame) * event.trackUI.frameWidth;

  return (
    <div
      data-role="out-of-bounds-overlay"
      style={EVENT_BAR_STYLES.outOfBoundsOverlay(left)}
    />
  );
}
