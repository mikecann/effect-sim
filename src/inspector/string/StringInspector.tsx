import { Accordion } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import StringSettingsSection from "./StringSettingsSection";
import type { StringNodeModel } from "../../../shared/models/StringNodeModel";

export const StringInspector = ({ node }: { node: StringNodeModel }) => {

  return (
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
          <StringSettingsSection node={node} />
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
};
