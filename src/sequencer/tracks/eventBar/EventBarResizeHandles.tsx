import type { TrackEventUIModel } from "../../models/TrackEventUIModel";

interface EventBarResizeHandlesProps {
  event: TrackEventUIModel;
}

export function EventBarResizeHandles({ event }: EventBarResizeHandlesProps) {
  return (
    <>
      {/* Left handle - invisible hit area */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: -2,
          width: 10,
          height: "100%",
          cursor: "ew-resize",
          zIndex: 10,
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          event.startDrag("left", e.clientX);
        }}
      />

      {/* Left handle - visible indicator */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 6,
          height: "100%",
          background: "rgba(255,255,255,0.15)",
          borderTopLeftRadius: 4,
          borderBottomLeftRadius: 4,
          pointerEvents: "none",
        }}
      />

      {/* Right handle - invisible hit area */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: -2,
          width: 10,
          height: "100%",
          cursor: "ew-resize",
          zIndex: 10,
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          event.startDrag("right", e.clientX);
        }}
      />

      {/* Right handle - visible indicator */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 6,
          height: "100%",
          background: "rgba(255,255,255,0.15)",
          borderTopRightRadius: 4,
          borderBottomRightRadius: 4,
          pointerEvents: "none",
        }}
      />
    </>
  );
}
