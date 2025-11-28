import { Accordion, Stack } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import { MultiStringSettingsSection } from "./settings/MultiStringSettingsSection";
import type { StringNodeModel } from "../../../shared/models/StringNodeModel";

interface StringsInspectorProps {
  nodes: Array<StringNodeModel>;
}

export function StringsInspector({ nodes }: StringsInspectorProps) {
  return (
    <Stack gap="md" style={{ height: "100%" }}>
      <Accordion
        multiple={false}
        defaultValue="settings"
        variant="contained"
        styles={{
          panel: { backgroundColor: "var(--color-tabset-background)" },
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
            <MultiStringSettingsSection nodes={nodes} />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
