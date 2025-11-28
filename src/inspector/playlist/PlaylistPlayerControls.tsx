import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconRotateClockwise,
} from "@tabler/icons-react";
import { PlaylistPlayerModel } from "./PlaylistPlayerModel";

export function PlaylistPlayerControls({
  model,
}: {
  model: PlaylistPlayerModel;
}) {
  return (
    <Group gap="md" justify="center" pt="sm">
      <Tooltip label={model.isPlaying ? "Pause" : "Play"} openDelay={400}>
        <ActionIcon
          aria-label={model.isPlaying ? "Pause" : "Play"}
          size="xl"
          variant="light"
          radius="xl"
          onClick={() => {
            if (model.isPlaying) model.pause();
            else model.play();
          }}
        >
          {model.isPlaying ? (
            <IconPlayerPause size={28} />
          ) : (
            <IconPlayerPlay size={28} />
          )}
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Reset" openDelay={400} disabled={model.isPlaying}>
        <ActionIcon
          aria-label="Reset"
          size="xl"
          variant="light"
          radius="xl"
          onClick={() => model.reset()}
          style={{ visibility: model.isPlaying ? "hidden" : "visible" }}
        >
          <IconRotateClockwise size={28} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
