import { Accordion, Box, Button } from "@mantine/core";
import { IconSettings, IconAdjustments, IconTrash } from "@tabler/icons-react";
import { GeneralEventSection } from "../GeneralEventSection";
import { EffectPropsSection } from "../EffectPropsSection";
import type { AllTrackEventModels } from "../../../../shared/models/sequencer";
import { useApp } from "../../../common/AppContext";

type EventInspectorProps = {
  event: AllTrackEventModels;
};

export function EventInspector({ event }: EventInspectorProps) {
  const appModel = useApp();

  return (
    <>
      <Accordion
        multiple
        defaultValue={["general", "effectProps"]}
        variant="contained"
        styles={{
          panel: {
            backgroundColor: "var(--fl-color-tabset-background)",
          },
          control: {
            paddingTop: 0,
            paddingBottom: 0,
            minHeight: "unset",
          },
          label: {
            fontSize: 14,
          },
        }}
      >
        <Accordion.Item value="general">
          <Accordion.Control icon={<IconSettings size={16} />}>
            General
          </Accordion.Control>
          <Accordion.Panel>
            <GeneralEventSection event={event} />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="effectProps">
          <Accordion.Control icon={<IconAdjustments size={16} />}>
            Effect
          </Accordion.Control>
          <Accordion.Panel>
            {/* Keyed by event, so the preview starts over for each. */}
            <EffectPropsSection key={event.id} event={event} />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <Button
        leftSection={<IconTrash size={16} />}
        color="red"
        variant="light"
        onClick={() => {
          event.remove();
          if (
            appModel.selectedEntity?.kind === "event" &&
            appModel.selectedEntity.event.id === event.id
          )
            appModel.setSelectedEntity(null);
        }}
        fullWidth
        mt="sm"
      >
        Delete Event
      </Button>
    </>
  );
}
