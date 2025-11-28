import type { TrackEventUIModel } from "../../models/TrackEventUIModel";
import { useDocumentEvent } from "../../../common/utils/useDocumentEvent";

interface EventBarDragHandlerProps {
  event: TrackEventUIModel;
}

/**
 * Component that manages global mouse event listeners for dragging
 */
export function EventBarDragHandler({ event }: EventBarDragHandlerProps) {
  useDocumentEvent(
    "mousemove",
    (e) => {
      event.updateDrag({
        clientX: e.clientX,
        clientY: e.clientY,
        isAltPressed: e.altKey,
        frameWidth: event.trackUI.frameWidth,
      });
    },
    event.isDragging,
  );

  useDocumentEvent("mouseup", () => event.endDrag(), event.isDragging);

  return null;
}
