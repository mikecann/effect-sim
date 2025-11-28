import { Accordion, Box, Button } from "@mantine/core";
import { IconSettings, IconAdjustments, IconTrash } from "@tabler/icons-react";
import { GeneralEventSection } from "../GeneralEventSection";
import { StringEffectPropsSection } from "../StringEffectPropsSection";
import { SwitchEffectPropsSection } from "../SwitchEffectPropsSection";
import type { AllTrackEventModels } from "../../../../shared/models/sequencer";
import { useApp } from "../../../common/AppContext";

type EventInspectorProps = {
  event: AllTrackEventModels;
};

export function EventInspector({ event }: EventInspectorProps) {
  const appModel = useApp();
  const track = event.track;

  return (
    <>
      <Accordion
        multiple
        defaultValue={
          event.kind === "string_effect" || event.kind === "switch_effect"
            ? ["general", "effectProps"]
            : ["general"]
        }
        variant="contained"
        styles={{
          panel: {
            backgroundColor: "var(--color-tabset-background)",
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

        {event.kind === "string_effect" && (
          <Accordion.Item value="effectProps">
            <Accordion.Control icon={<IconAdjustments size={16} />}>
              Effect
            </Accordion.Control>
            <Accordion.Panel>
              <StringEffectPropsSection event={event} />
            </Accordion.Panel>
          </Accordion.Item>
        )}
        {event.kind === "switch_effect" && (
          <Accordion.Item value="effectProps">
            <Accordion.Control icon={<IconAdjustments size={16} />}>
              Effect
            </Accordion.Control>
            <Accordion.Panel>
              <SwitchEffectPropsSection event={event} />
            </Accordion.Panel>
          </Accordion.Item>
        )}
      </Accordion>
      <Button
        leftSection={<IconTrash size={16} />}
        color="red"
        variant="light"
        onClick={() => {
          try {
            event.remove();
            // Clear selection if the deleted event was selected
            if (
              appModel.selectedEntity?.kind === "event" &&
              appModel.selectedEntity.event.id === event.id
            )
              appModel.setSelectedEntity(null);
          } catch (error) {
            console.error("Failed to delete event:", error);
          }
        }}
        fullWidth
        mt="sm"
      >
        Delete Event
      </Button>
    </>
  );
}
