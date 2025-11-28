import { useCallback } from "react";
import { useApp } from "../common/AppContext";
import { useConfirmation } from "../common/confirmation/ConfirmationProvider";

export function useDeleteSelectedNodes() {
  const appModel = useApp();
  const project = appModel.getProject();
  const { confirm } = useConfirmation();

  const selectedNodeIds = appModel.selectedNodeIds;

  const deleteSelectedNodes = useCallback(async () => {
    if (selectedNodeIds.length === 0) return;

    const shouldDelete = await confirm({
      title: "Delete selected nodes",
      content: `Are you sure you want to delete ${selectedNodeIds.length === 1 ? "this node" : "these nodes"}? This action cannot be undone.`,
      confirmButton: "Delete",
      confirmButtonColor: "red",
      confirmButtonVariant: "filled",
    });
    if (!shouldDelete) return;

    for (const id of selectedNodeIds) {
      const node = project.nodes.find((n) => n._id === id);
      if (node) node.remove();
    }

    appModel.clearSelection();
  }, [selectedNodeIds, confirm, project, appModel]);

  return { deleteSelectedNodes, hasSelection: selectedNodeIds.length > 0 };
}
