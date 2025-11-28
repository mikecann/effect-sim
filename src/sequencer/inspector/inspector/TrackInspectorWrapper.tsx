import { Box } from "@mantine/core";
import { TrackInspector } from "../track/TrackInspector";
import type { TrackModel } from "../../../../shared/models/sequencer/TrackModel";

type TrackInspectorWrapperProps = {
  track: TrackModel;
};

export function TrackInspectorWrapper({ track }: TrackInspectorWrapperProps) {
  if (track.index === -1) return null;

  return (
    <Box
      key={track.id}
      style={{
        height: "100%",
        backgroundColor: "var(--mantine-color-dark-7)",
        borderLeft: "1px solid var(--mantine-color-dark-4)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        pt="xs"
        pl="sm"
        pr="sm"
        pb="sm"
        style={{
          flex: 1,
          overflow: "auto",
        }}
      >
        <TrackInspector track={track} />
      </Box>
    </Box>
  );
}
