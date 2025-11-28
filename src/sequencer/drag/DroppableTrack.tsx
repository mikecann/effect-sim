import type { ReactNode } from "react";

export function DroppableTrack({
  trackId,
  children,
}: {
  trackId: string;
  children: ReactNode;
}) {
  return (
    <div
      data-track-drop={trackId}
      style={{
        position: "relative",
      }}
    >
      {children}
    </div>
  );
}

