import { Stack, Group, Button, ScrollArea, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useApp } from "../common/AppContext";
import NewPlaylistModal from "./NewPlaylistModal";
import { PlaylistRow } from "./PlaylistRow";

export default function PlaylistsPanel() {
  const project = useApp().getProject();
  const [newModalOpened, setNewModalOpened] = useState(false);

  return (
    <>
      <Stack gap="0" style={{ height: "100%" }}>
        <Group
          bg="var(--mantine-color-dark-6)"
          p={4}
          gap="xs"
          justify="flex-end"
        >
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() => setNewModalOpened(true)}
          >
            New Playlist
          </Button>
        </Group>
        <ScrollArea style={{ flex: 1 }}>
          <div>
            {project.playlists.map((playlist) => (
              <PlaylistRow key={playlist._id} playlist={playlist} />
            ))}
            {project.playlists.length === 0 && (
              <Text c="dimmed" size="sm" ta="center" py="xl" p="md">
                No playlists yet. Create one to get started.
              </Text>
            )}
          </div>
        </ScrollArea>
      </Stack>
      <NewPlaylistModal
        opened={newModalOpened}
        onClose={() => setNewModalOpened(false)}
      />
    </>
  );
}
