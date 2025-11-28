import { ActionIcon } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useDeleteSelectedNodes } from "./useDeleteSelectedNodes";

export function NodesTreeDeleteAction() {
  const { deleteSelectedNodes, hasSelection } = useDeleteSelectedNodes();

  if (!hasSelection) return null;

  return (
    <ActionIcon
      size="sm"
      variant="subtle"
      aria-label="Delete selected nodes"
      color="red"
      onClick={deleteSelectedNodes}
    >
      <IconTrash size={16} />
    </ActionIcon>
  );
}
