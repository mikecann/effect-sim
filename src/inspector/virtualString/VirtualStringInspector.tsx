import { Accordion } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import VirtualStringSettingsSection from "./VirtualStringSettingsSection";
import type { VirtualStringNodeModel } from "../../../shared/models/VirtualStringNodeModel";

export const VirtualStringInspector = ({
  node,
}: {
  node: VirtualStringNodeModel;
}) => {

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
          <VirtualStringSettingsSection node={node} />
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
};

