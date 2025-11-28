import { Box } from "@mantine/core";
import { EventInspector } from "./EventInspector";
import type { AllTrackEventModels } from "../../../../shared/models/sequencer";

type EventInspectorWrapperProps = {
  event: AllTrackEventModels;
};

export function EventInspectorWrapper({ event }: EventInspectorWrapperProps) {
  return (
    <Box
      key={event.id}
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
        <EventInspector event={event} />
      </Box>
    </Box>
  );
}
