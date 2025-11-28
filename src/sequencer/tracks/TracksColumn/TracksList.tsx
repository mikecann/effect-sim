import { Box, Button, ScrollArea, Stack } from "@mantine/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ROW_HEIGHT } from "../../sequencer";
import { TrackListItem } from "./TrackListItem";
import { IconPlus } from "@tabler/icons-react";
import { useSequence } from "../../SequencerContext";

export function TracksList() {
  const sequence = useSequence();
  const trackIds = sequence.sequence.tracks.map((track) => track.id);

  return (
    <ScrollArea
      h={`calc(100% - ${ROW_HEIGHT}px)`}
      scrollbarSize={8}
      styles={{ viewport: { overflowX: "hidden" } }}
    >
      <SortableContext items={trackIds} strategy={verticalListSortingStrategy}>
        <Stack gap={0}>
          {sequence.sequence.tracks.map((track) => (
            <TrackListItem
              key={track.id}
              track={track}
              isSelected={sequence.selectedTrack?.id === track.id}
            />
          ))}
          <Box
            style={{
              padding: 16,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Button
              variant="light"
              onClick={() => sequence.sequence.addTrack()}
              leftSection={<IconPlus size={16} />}
            >
              Add Track
            </Button>
          </Box>
        </Stack>
      </SortableContext>
    </ScrollArea>
  );
}
