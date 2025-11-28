import { DragOverlay } from "@dnd-kit/core";
import { TrackListItem } from "./TrackListItem";
import type { Track } from "../../../../convex/schema";
import { useApp } from "../../../common/AppContext";

type DragOverlayTrackProps = {
  activeId: string | null;
  activeTrack: Track | null;
};

export function DragOverlayTrack({
  activeId,
  activeTrack,
}: DragOverlayTrackProps) {
  const appModel = useApp();
  const selectedTrackId =
    appModel.selectedEntity?.kind === "track"
      ? appModel.selectedEntity.track.id
      : null;
  return (
    <DragOverlay>
      {activeId && activeTrack ? (
        <TrackListItem
          track={activeTrack}
          isSelected={selectedTrackId === activeTrack.id}
        />
      ) : null}
    </DragOverlay>
  );
}
