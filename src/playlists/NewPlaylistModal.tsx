import { useMemo } from "react";
import { Button, Modal, Stack, TextInput } from "@mantine/core";
import { useApp } from "../common/AppContext";

export default function NewPlaylistModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const appModel = useApp();
  const project = appModel.getProject();
  const newPlaylist = useMemo(
    () => project.newPlaylist({ name: "New Playlist" }),
    [project],
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create New Playlist"
      size="sm"
    >
      <Stack gap="sm">
        <TextInput
          label="Playlist Name"
          value={newPlaylist.name}
          autoFocus
          onChange={(e) => newPlaylist.setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newPlaylist.name) {
              e.preventDefault();
              project.addPlaylist(newPlaylist);
              onClose();
            }
          }}
        />
        <Button
          disabled={!newPlaylist.name}
          onClick={() => {
            if (!newPlaylist.name.trim()) return;
            project.addPlaylist(newPlaylist);
            onClose();
          }}
        >
          Create Playlist
        </Button>
      </Stack>
    </Modal>
  );
}
