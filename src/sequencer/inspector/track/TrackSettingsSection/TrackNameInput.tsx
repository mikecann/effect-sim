import { Group, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import type { TrackModel } from "../../../../../shared/models/sequencer/TrackModel";

type TrackNameInputProps = {
  track: TrackModel;
  initialName: string;
};

export function TrackNameInput({
  track,
  initialName,
}: TrackNameInputProps) {
  const [name, setName] = useState<string>(initialName);

  return (
    <Group justify="space-between" align="center">
      <Text size="sm" fw={500} style={{ minWidth: "80px" }}>
        Name
      </Text>
      <TextInput
        value={name}
        placeholder="Enter track name"
        onChange={(e) => {
          const v = e.currentTarget.value;
          setName(v);
          const trimmed = v.trim();
          if (trimmed.length === 0) return;
          if (trimmed === initialName) return;

          try {
            track.sequence.renameTrack(track.id, trimmed);
          } catch (error) {
            console.error("Failed to rename track:", error);
          }
        }}
        data-autofocus
        style={{ flex: 1, maxWidth: "200px" }}
      />
    </Group>
  );
}

