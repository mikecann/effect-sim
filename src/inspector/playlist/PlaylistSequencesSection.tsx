import type { SequenceKey } from "../../../shared/models/docs";
import { Stack, Text, Select, Box, Group, Badge } from "@mantine/core";
import { useState, useRef } from "react";
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
  const keepOpenRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const sortableIds = playlist.sequenceIds.map((id, index) => `${id}-${index}`);

  const sequenceCountsInPlaylist = playlist.availableSequences.reduce(
    (acc, seq) => {
      acc[seq.key] = playlist.sequenceIds.filter((id) => id === seq.key).length;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <Stack gap="md">
      <Box>
        <Text size="sm" fw={500} mb="xs">
          Add Sequence
        </Text>
        <Select
          placeholder="Select a sequence"
          data={playlist.availableSequences.map((seq) => ({
            value: seq.key,
            label: seq.name,
          }))}
          value={selectedSequenceId}
          dropdownOpened={dropdownOpened}
          onDropdownOpen={() => setDropdownOpened(true)}
          onDropdownClose={() => {
            if (keepOpenRef.current) {
              keepOpenRef.current = false;
              return;
            }
            setDropdownOpened(false);
          }}
          onChange={(value) => {
            if (!value) return;
            keepOpenRef.current = true;
            playlist.addSequence(value as SequenceKey);
            setSelectedSequenceId(null);
          }}
          renderOption={({ option }) => {
            const count = sequenceCountsInPlaylist[option.value] ?? 0;
            return (
              <Group justify="space-between" w="100%">
                <span>{option.label}</span>
                {count > 0 ? (
                  <Badge size="xs" variant="light" color="gray">
                    {count}
                  </Badge>
                ) : null}
              </Group>
            );
          }}
        />
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

              const oldIndex = sortableIds.indexOf(active.id as string);
              const newIndex = sortableIds.indexOf(over.id as string);

              if (oldIndex === -1 || newIndex === -1) return;

              playlist.reorderSequences(oldIndex, newIndex);
            }}
          >
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              <Stack gap="xs">
                {playlist.sequences.map((sequence, index) => (
                  <PlaylistSequenceItem
                    key={sortableIds[index]}
                    sortableId={sortableIds[index]}
                    sequence={sequence}
                    sequenceIndex={index}
                    onRemove={() => {
                      playlist.removeSequenceByIndex(index);
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
