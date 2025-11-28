import { Stack, Text, TextInput, Group } from "@mantine/core";
import { PlaylistModel } from "../../../shared/models/PlaylistModel";

export default function PlaylistSettingsSection({
  playlist,
}: {
  playlist: PlaylistModel;
}) {
  if (!playlist)
    return (
      <Stack p="md" gap="sm">
        <Text c="dimmed" size="sm">
          Loading…
        </Text>
      </Stack>
    );

  return (
    <Stack pt="xs" gap="xs">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500} style={{ minWidth: "80px" }}>
          Name
        </Text>
        <TextInput
          value={playlist.name}
          placeholder="Enter playlist name"
          onChange={(e) => playlist.setName(e.currentTarget.value)}
          data-autofocus
          style={{ flex: 1, maxWidth: "200px" }}
        />
      </Group>
    </Stack>
  );
}
