import { Accordion, Button, Stack } from "@mantine/core";
import { IconSettings, IconTrash } from "@tabler/icons-react";
import type { TrackModel } from "../../../../shared/models/sequencer/TrackModel";
import { TrackSettingsSection } from "./TrackSettingsSection/TrackSettingsSection";
import { useApp } from "../../../common/AppContext";
import { useConfirmation } from "../../../common/confirmation/ConfirmationProvider";

export const TrackInspector = ({ track }: { track: TrackModel }) => {
  const appModel = useApp();
  const { confirm } = useConfirmation();

  return (
    <Stack gap="xs">
      <Accordion
        multiple
        defaultValue={["settings"]}
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
        <Accordion.Item value="settings">
          <Accordion.Control icon={<IconSettings size={16} />}>
            Settings
          </Accordion.Control>
          <Accordion.Panel>
            <TrackSettingsSection track={track} />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Button
        leftSection={<IconTrash size={16} />}
        color="red"
        variant="light"
        onClick={async () => {
          const confirmed = await confirm({
            title: "Delete track?",
            content: `Are you sure you want to delete the track "${track.name}"?`,
            confirmButton: "Delete",
            confirmButtonColor: "red",
            confirmButtonVariant: "filled",
          });
          if (!confirmed) return;

          track.remove();
          // Clear selection if the deleted track was selected
          if (
            appModel.selectedEntity?.kind === "track" &&
            appModel.selectedEntity.track.id === track.id
          )
            appModel.setSelectedEntity(null);
        }}
        fullWidth
      >
        Delete Track
      </Button>
    </Stack>
  );
};
