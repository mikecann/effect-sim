import { useEffect } from "react";
import { useConfirmation } from "../../../common/confirmation/ConfirmationProvider";
import type { SequenceModel } from "../../../../shared/models/sequencer/SequenceModel";
import { useApp } from "../../../common/AppContext";

type UseDeleteTrackShortcutProps = {
  sequence: SequenceModel;
};

export function useDeleteTrackShortcut({
  sequence,
}: UseDeleteTrackShortcutProps) {
  const { confirm } = useConfirmation();
  const appModel = useApp();
  const selectedTrackId =
    appModel.selectedEntity?.kind === "track"
      ? appModel.selectedEntity.track.id
      : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Delete key when a track is selected and no input is focused
      if (
        e.key === "Delete" &&
        selectedTrackId &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        const track = sequence.tracks.find((t) => t.id === selectedTrackId);
        if (!track) return;

        // If track has no events, delete immediately without confirmation
        if (track.events.length === 0) {
          sequence.removeTrack(selectedTrackId);
          appModel.setSelectedEntity(null);
          return;
        }

        // Otherwise, show confirmation modal
        confirm({
          title: "Delete track?",
          content: `Are you sure you want to delete the track "${track.name}"?`,
          confirmButton: "Delete",
          confirmButtonColor: "red",
          confirmButtonVariant: "filled",
        }).then((confirmed) => {
          if (!confirmed) return;
          sequence.removeTrack(selectedTrackId);
          appModel.setSelectedEntity(null);
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirm, selectedTrackId, sequence, appModel]);
}
