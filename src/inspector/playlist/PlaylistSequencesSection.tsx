import { Stack, Text, Select, Box } from "@mantine/core";
import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PlaylistSequenceItem } from "./PlaylistSequenceItem";
import { PlaylistPlayerModel } from "./PlaylistPlayerModel";
import { PlaylistModel } from "../../../shared/models/PlaylistModel";

export function PlaylistSequencesSection({
  playlist,
  playerModel,
}: {
  playlist: PlaylistModel;
  playerModel: PlaylistPlayerModel | null;
}) {
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(
    null,
  );
  const [dropdownOpened, setDropdownOpened] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  return (
    <Stack gap="md">
      <Box>
        <Text size="sm" fw={500} mb="xs">
          Add Sequence
        </Text>
        <Select
          placeholder="Select a sequence"
          data={playlist.sequencesNotOnPlaylist.map((seq) => ({
            value: seq._id,
            label: seq.name,
          }))}
          value={selectedSequenceId}
          dropdownOpened={dropdownOpened}
          onDropdownOpen={() => setDropdownOpened(true)}
          onDropdownClose={() => setDropdownOpened(false)}
          onChange={(value) => {
            if (!value) return;
            playlist.addSequence(value as Id<"sequences">);
            setSelectedSequenceId(null);
          }}
          disabled={playlist.sequencesNotOnPlaylist.length === 0}
        />
        {playlist.sequencesNotOnPlaylist.length === 0 && (
          <Text size="xs" c="dimmed" mt="xs">
            All sequences have been added to this playlist
          </Text>
        )}
      </Box>

      <Box>
        <Text size="sm" fw={500} mb="xs">
          Sequence List
        </Text>
        {playlist.sequences.length === 0 ? (
          <Text size="sm" c="dimmed">
            No sequences in this playlist yet
          </Text>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => {
              const { active, over } = event;

              if (!over || active.id === over.id) return;

              const oldIndex = playlist.sequenceIds.indexOf(
                active.id as Id<"sequences">,
              );
              const newIndex = playlist.sequenceIds.indexOf(
                over.id as Id<"sequences">,
              );

              if (oldIndex === -1 || newIndex === -1) return;

              playlist.reorderSequences(oldIndex, newIndex);
            }}
          >
            <SortableContext
              items={playlist.sequenceIds}
              strategy={verticalListSortingStrategy}
            >
              <Stack gap="xs">
                {playlist.sequences.map((sequence, index) => (
                  <PlaylistSequenceItem
                    key={sequence._id}
                    sequence={sequence}
                    sequenceIndex={index}
                    onRemove={() => {
                      playlist.removeSequence(sequence._id);
                    }}
                    playerModel={playerModel}
                  />
                ))}
              </Stack>
            </SortableContext>
          </DndContext>
        )}
      </Box>
    </Stack>
  );
}
