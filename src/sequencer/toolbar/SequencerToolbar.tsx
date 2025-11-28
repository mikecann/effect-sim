import { ActionIcon, Box, Tooltip } from "@mantine/core";
import SequenceSelectorAndControls from "./SequenceSelectorAndControls";
import { useSequence } from "../SequencerContext";
import { IconPlayerPause, IconPlayerPlay } from "@tabler/icons-react";

export default function SequencerToolbar() {
  const sequence = useSequence();

  return (
    <Box
      bg="var(--mantine-color-dark-6)"
      p={4}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
      }}
    >
      <Box style={{ justifySelf: "start" }}>
        <SequenceSelectorAndControls />
      </Box>

      <Box style={{ justifySelf: "center" }}>
        <Tooltip label={sequence.isPlaying ? "Pause" : "Play"} openDelay={400}>
          <ActionIcon
            aria-label={sequence.isPlaying ? "Pause" : "Play"}
            size="md"
            variant="light"
            radius="xl"
            onClick={() => sequence.setIsPlaying((p) => !p)}
          >
            {sequence.isPlaying ? (
              <IconPlayerPause size={18} />
            ) : (
              <IconPlayerPlay size={18} />
            )}
          </ActionIcon>
        </Tooltip>
      </Box>

      <Box />
    </Box>
  );
}
