import { Accordion } from "@mantine/core";
import { IconSettings, IconPower } from "@tabler/icons-react";
import SwitchSettingsSection from "./SwitchSettingsSection";
import SwitchControlsSection from "./SwitchControlsSection";
import type { SwitchNodeModel } from "../../../shared/models/SwitchNodeModel";

export const SwitchInspector = ({ node }: { node: SwitchNodeModel }) => {

  return (
    <Accordion
      multiple
      defaultValue={["settings", "controls"]}
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
          <SwitchSettingsSection node={node} />
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="controls">
        <Accordion.Control icon={<IconPower size={16} />}>
          Controls
        </Accordion.Control>
        <Accordion.Panel>
          <SwitchControlsSection node={node} />
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
};

