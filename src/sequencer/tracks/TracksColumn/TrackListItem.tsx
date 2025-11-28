import { useRef, useEffect } from "react";
import { Box, Text, ActionIcon, Tooltip, Group } from "@mantine/core";
import { IconCopy, IconTrash } from "@tabler/icons-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ROW_HEIGHT } from "../../sequencer";
import type { Track } from "../../../../convex/schema";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useConfirmation } from "../../../common/confirmation/ConfirmationProvider";
import { useApp } from "../../../common/AppContext";
import { useSequence } from "../../SequencerContext";

type TrackListItemProps = {
  track: Track;
  isSelected: boolean;
};

export function TrackListItem({ track, isSelected }: TrackListItemProps) {
  const { confirm } = useConfirmation();
  const appModel = useApp();
  const sequence = useSequence();
  const hasMovedRef = useRef(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: track.id,
  });

  useEffect(() => {
    if (transform) hasMovedRef.current = true;
    else if (!isDragging) hasMovedRef.current = false;
  }, [transform, isDragging]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Box
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (hasMovedRef.current) return;
        const trackModel = sequence.sequence.tracks.find((t) => t.id === track.id);
        if (!trackModel) return;
        appModel.setSelectedEntity({
          kind: "track",
          track: trackModel,
          sequence: sequence.sequence,
        });
      }}
      style={{
        ...style,
        height: ROW_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        paddingLeft: 8,
        paddingRight: 8,
        borderBottom: "1px solid var(--mantine-color-dark-5)",
        backgroundColor: isSelected
          ? "var(--mantine-color-blue-9)"
          : "transparent",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
      }}
    >
      <Text
        size="sm"
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}
        title={track.name}
      >
        {track.name}
      </Text>
      {isSelected && (
        <Group gap={4}>
          <Tooltip label="Duplicate track" openDelay={400}>
            <ActionIcon
              aria-label="Duplicate track"
              size="sm"
              variant="subtle"
              onClick={(event) => {
                event.stopPropagation();
                try {
                  const newTrackId = sequence.sequence.duplicateTrack(track.id);
                  const newTrack = sequence.sequence.tracks.find(
                    (t) => t.id === newTrackId,
                  );
                  if (!newTrack) return;
                  appModel.setSelectedEntity({
                    kind: "track",
                    track: newTrack,
                    sequence: sequence.sequence,
                  });
                } catch (error) {
                  console.error("Failed to duplicate track:", error);
                }
              }}
            >
              <IconCopy size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete track" openDelay={400}>
            <ActionIcon
              aria-label="Delete track"
              size="sm"
              variant="subtle"
              color="red"
              onClick={async (event) => {
                event.stopPropagation();
                // If track has no events, delete immediately without confirmation
                if (track.events.length === 0) {
                  sequence.sequence.removeTrack(track.id);
                  appModel.setSelectedEntity(null);
                  return;
                }

                // Otherwise, show confirmation modal
                const confirmed = await confirm({
                  title: "Delete track?",
                  content: `Are you sure you want to delete the track "${track.name}"?`,
                  confirmButton: "Delete",
                  confirmButtonColor: "red",
                  confirmButtonVariant: "filled",
                });

                if (!confirmed) return;

                sequence.sequence.removeTrack(track.id);
                appModel.setSelectedEntity(null);
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}
    </Box>
  );
}
