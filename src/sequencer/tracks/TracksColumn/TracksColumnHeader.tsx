import { Box, Text, ActionIcon, Tooltip } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { ROW_HEIGHT } from "../../sequencer";
import { SequenceModel } from "../../../../shared/models/sequencer/SequenceModel";

type TracksColumnHeaderProps = {
  sequence: SequenceModel;
};

export function TracksColumnHeader({ sequence }: TracksColumnHeaderProps) {
  return (
    <Box
      style={{
        height: ROW_HEIGHT,
        borderBottom: "1px solid var(--mantine-color-dark-5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: 8,
        paddingRight: 8,
      }}
    >
      <Text size="xs" fw={600}>
        Tracks
      </Text>
      <Tooltip label="Add track" openDelay={400}>
        <ActionIcon
          aria-label="Add track"
          size="sm"
          variant="subtle"
          onClick={() => sequence.addTrack()}
        >
          <IconPlus size={14} />
        </ActionIcon>
      </Tooltip>
    </Box>
  );
}
