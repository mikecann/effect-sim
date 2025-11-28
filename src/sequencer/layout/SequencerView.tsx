import { Box, Stack } from "@mantine/core";
import TimelineViewport from "../timeline/TimelineViewport/TimelineViewport";
import TracksColumn from "../tracks/TracksColumn/TracksColumn";
import { LABEL_COLUMN_WIDTH } from "../sequencer";
import { SequencerPlayer } from "./SequencerPlayer";

export default function SequencerView() {
  return (
    <Stack gap={0} style={{ height: "100%", minHeight: 0 }}>
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: `${LABEL_COLUMN_WIDTH}px 1fr`,
          minHeight: 0,
          flex: 1,
        }}
      >
        <TracksColumn />
        <TimelineViewport />
        <SequencerPlayer />
      </Box>
    </Stack>
  );
}
