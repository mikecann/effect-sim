import { Stack } from "@mantine/core";
import type { TrackModel } from "../../../../../shared/models/sequencer/TrackModel";
import { TrackNameInput } from "./TrackNameInput";
import { TrackOrderInput } from "./TrackOrderInput";

export function TrackSettingsSection({ track }: { track: TrackModel }) {
  return (
    <Stack pt="xs" gap="xs">
      <TrackNameInput track={track} initialName={track.name} />
      <TrackOrderInput
        trackIndex={track.index}
        tracksCount={track.sequence.tracks.length}
        onOrderChange={(newIndex: number) => {
          try {
            track.sequence.reorderTrack(track.id, newIndex);
          } catch (error) {
            console.error("Failed to reorder track:", error);
          }
        }}
      />
    </Stack>
  );
}
