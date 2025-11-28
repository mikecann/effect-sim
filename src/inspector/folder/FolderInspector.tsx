import { Accordion } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import FolderSettingsSection from "./FolderSettingsSection";
import type { FolderNodeModel } from "../../../shared/models/FolderNodeModel";

export const FolderInspector = ({ node }: { node: FolderNodeModel }) => {

  return (
    <Accordion
      multiple
      defaultValue={["settings", "effects"]}
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
          <FolderSettingsSection node={node} />
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
};
