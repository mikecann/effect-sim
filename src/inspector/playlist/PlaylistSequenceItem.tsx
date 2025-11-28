import { Box, Text, ActionIcon } from "@mantine/core";
import { IconTrash, IconGripVertical } from "@tabler/icons-react";
import { useRef, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlaylistPlayerModel } from "./PlaylistPlayerModel";
import { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";
import { autorun } from "mobx";

export function PlaylistSequenceItem({
  sequence,
  sequenceIndex,
  onRemove,
  playerModel,
}: {
  sequence: SequenceModel;
  sequenceIndex: number;
  onRemove: () => void;
  playerModel: PlaylistPlayerModel | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sequence._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isCurrentSequence = playerModel?.currentSequenceIndex === sequenceIndex;

  const progressBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isCurrentSequence || !playerModel) {
      if (progressBarRef.current) progressBarRef.current.style.width = "0%";
      return;
    }

    return autorun(() => {
      if (!progressBarRef.current) return;
      const progress =
        playerModel.currentSequenceNumFrames > 0
          ? playerModel.runtime.playhead.frame /
            playerModel.currentSequenceNumFrames
          : 0;
      progressBarRef.current.style.width = `${progress * 100}%`;
    });
  }, [isCurrentSequence, playerModel]);

  return (
    <Box
      ref={setNodeRef}
      style={{
        ...style,
        borderRadius: "4px",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "var(--mantine-color-dark-6)",
      }}
      {...attributes}
    >
      {/* Progress bar background */}
      {isCurrentSequence && (
        <Box
          ref={progressBarRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "0%",
            backgroundColor: "var(--mantine-color-blue-6)",
            opacity: 0.3,
            transition: "width 0.1s linear",
            pointerEvents: "none",
          }}
        />
      )}

      <Box
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Box
          {...listeners}
          style={{ cursor: isDragging ? "grabbing" : "grab", display: "flex" }}
        >
          <IconGripVertical size={18} />
        </Box>
        <Text size="sm" style={{ flex: 1 }}>
          {sequence.name}
        </Text>
        <ActionIcon variant="subtle" color="red" size="sm" onClick={onRemove}>
          <IconTrash size={14} />
        </ActionIcon>
      </Box>
    </Box>
  );
}
