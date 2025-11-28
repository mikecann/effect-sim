import { Stack } from "@mantine/core";
import type { AllTrackEventModels } from "../../../shared/models/sequencer";
import { EventAppliesToSection } from "./EventAppliesToSection";

type GeneralEventSectionProps = {
  event: AllTrackEventModels;
};

export function GeneralEventSection({
  event,
}: GeneralEventSectionProps) {
  return (
    <Stack gap="md">
      <EventAppliesToSection event={event} />
    </Stack>
  );
}
