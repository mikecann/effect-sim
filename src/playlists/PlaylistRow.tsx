import { Group, Text, ActionIcon, Tooltip } from "@mantine/core";
import { IconTrash, IconPlaylist } from "@tabler/icons-react";
import { useApp } from "../common/AppContext";
import { useConfirmation } from "../common/confirmation/ConfirmationProvider";
import { PlaylistModel } from "../../shared/models/PlaylistModel";

interface PlaylistRowProps {
  playlist: PlaylistModel;
}

export function PlaylistRow({ playlist }: PlaylistRowProps) {
  const appModel = useApp();
  const { confirm } = useConfirmation();
  const project = appModel.getProject();

  const isSelected =
    appModel.selectedEntity?.kind === "playlist" &&
    appModel.selectedEntity.playlist._id === playlist._id;

  const isOnlySelected = isSelected;

  return (
    <Group
      gap={6}
      pl={6}
      p={6}
      wrap="nowrap"
      align="center"
      style={{
        flex: 1,
        cursor: "pointer",
        position: "relative",
        userSelect: "none",
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
      }}
      bg={isSelected ? "var(--mantine-color-dark-9)" : undefined}
      onClick={(e) => {
        e.preventDefault();

        if (!e.shiftKey && isOnlySelected) {
          appModel.setSelectedEntity(null);
          return;
        }

        appModel.setSelectedEntity({
          kind: "playlist",
          playlist,
        });
      }}
    >
      <Group gap={6} wrap="nowrap" align="center" style={{ flex: 1 }}>
        <IconPlaylist
          size={16}
          color={
            isSelected
              ? "var(--mantine-color-blue-4)"
              : "var(--mantine-color-gray-6)"
          }
        />
        <Group gap={4} wrap="nowrap">
          <Text
            c={isSelected ? "blue.2" : "bright"}
            style={{ userSelect: "none" }}
          >
            {playlist.name}
          </Text>
          <Text size="xs" c="dimmed" style={{ userSelect: "none" }}>
            ({playlist.sequences.length})
          </Text>
        </Group>
      </Group>
      {isOnlySelected ? (
        <Tooltip label="Delete" openDelay={400} position="left">
          <ActionIcon
            size="sm"
            variant="subtle"
            color="red"
            aria-label="Delete playlist"
            onClick={async (e) => {
              e.stopPropagation();
              const confirmed = await confirm({
                title: "Delete Playlist",
                content: `Are you sure you want to delete "${name}"?`,
                confirmButton: "Delete",
                confirmButtonColor: "red",
              });
              if (!confirmed) return;
              project.removePlaylist(playlist);
              //playlist.remove();
              if (isSelected) appModel.setSelectedEntity(null);
            }}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      ) : null}
    </Group>
  );
}
