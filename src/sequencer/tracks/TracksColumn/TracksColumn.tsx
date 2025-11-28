import { Box } from "@mantine/core";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { useSequence } from "../../SequencerContext";
import { useApp } from "../../../common/AppContext";
import type { TrackModel } from "../../../../shared/models/sequencer/TrackModel";
import { TracksColumnHeader } from "./TracksColumnHeader";
import { useDeleteTrackShortcut } from "./useDeleteTrackShortcut";
import { useTracksDrag } from "./useTracksDrag";
import { useTracksDragSensors } from "./useTracksDragSensors";
import { TracksList } from "./TracksList";
import { DragOverlayTrack } from "./DragOverlayTrack";

export default function TracksColumn() {
  const sequence = useSequence();
  const appModel = useApp();

  const sensors = useTracksDragSensors();

  const { activeId, handleDragStart, handleDragEnd, handleDragCancel } =
    useTracksDrag({
      tracks: sequence.sequence.tracks,
      onReorder: ({ trackId, targetIndex }) => {
        try {
          sequence.sequence.reorderTrack(trackId, targetIndex);
        } catch (error) {
          console.error("Failed to reorder track:", error);
        }
      },
    });

  const activeTrack = activeId
    ? (sequence.sequence.tracks.find(
        (track) => track.id === String(activeId),
      ) ?? null)
    : null;

  useDeleteTrackShortcut({
    sequence: sequence.sequence,
  });

  return (
    <Box style={{ borderRight: "1px solid var(--mantine-color-dark-5)" }}>
      <TracksColumnHeader sequence={sequence.sequence} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <TracksList />
        <DragOverlayTrack
          activeId={activeId ? String(activeId) : null}
          activeTrack={activeTrack}
        />
      </DndContext>
    </Box>
  );
}
