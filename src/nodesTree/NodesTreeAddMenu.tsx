import { ActionIcon, Menu } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useApp } from "../common/AppContext";
import { useFlexLayout } from "../common/FlexLayoutProvider";

export function NodesTreeAddMenu() {
  const appModel = useApp();
  const project = appModel.getProject();
  const { showInspector } = useFlexLayout();

  return (
    <Menu shadow="md" width={180} withinPortal>
      <Menu.Target>
        <ActionIcon size="sm" variant="subtle" aria-label="Add">
          <IconPlus size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          onClick={() => {
            const node = project.createStringNode({
              ledCount: 196,
              port: 4048,
            });
            appModel.setSelectedEntity({ kind: "node", node });
            showInspector();
          }}
        >
          Add String
        </Menu.Item>
        <Menu.Item
          onClick={() => {
            const node = project.createVirtualStringNode();
            appModel.setSelectedEntity({
              kind: "virtual_string",
              node,
              selectedSegmentIndex: null,
            });
            showInspector();
          }}
        >
          Add Virtual String
        </Menu.Item>
        <Menu.Item
          onClick={() => {
            project.createFolderNode({
              label: "New Folder",
            });
          }}
        >
          Add Folder
        </Menu.Item>
        <Menu.Item
          onClick={() => {
            const node = project.createSwitchNode();
            appModel.setSelectedEntity({ kind: "node", node });
            showInspector();
          }}
        >
          Add Switch
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
