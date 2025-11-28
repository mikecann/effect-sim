import type { NodeDoc } from "../../../shared/nodeTree";
import type { NodesTree } from "../../../shared/nodeTree";
import type { Id } from "../../../convex/_generated/dataModel";
import { exhaustiveCheck } from "../../../shared/misc";
import { getDropPosition } from "./getDropPosition";
import {
  findNodePath,
  getNodeAtPath,
  isFolder,
} from "../../../shared/nodeTree";

const defaultItem = { _id: "root", kind: "folder", label: "root" } as NodeDoc;

function getNodeName(data: NodeDoc): string {
  if (data.kind === "string") return data.name;
  if (data.kind === "virtual_string") return data.name;
  if (data.kind === "folder") return data.label;
  if (data.kind === "switch") return data.name;
  exhaustiveCheck(data);
}

export function createTreeConfig(nodeTree: NodesTree | null) {
  return {
    rootItemId: "root" as const,
    getItemName: (item: {
      getId: () => string;
      getItemData: () => NodeDoc;
    }) => {
      if (item.getId() === "root") return "Nodes";
      return getNodeName(item.getItemData());
    },
    isItemFolder: (item: { getId: () => string; getItemData: () => NodeDoc }) =>
      item.getId() === "root" || item.getItemData().kind === "folder",
    dataLoader: {
      getItem: (itemId: string) => {
        if (!nodeTree) return defaultItem;
        if (itemId === "root") return defaultItem;
        const path = findNodePath({
          tree: nodeTree,
          nodeId: itemId as Id<"nodes">,
        });
        if (path === null) return defaultItem;
        const node = getNodeAtPath(nodeTree, path);
        // This function expects NodeDoc but we have NodeOrFolder
        // We'll need to fetch the actual NodeDoc separately
        return defaultItem;
      },
      getChildren: (itemId: string) => {
        if (!nodeTree) return [];
        if (itemId === "root")
          return nodeTree.map((node) => ({ _id: node._id }));
        const path = findNodePath({
          tree: nodeTree,
          nodeId: itemId as Id<"nodes">,
        });
        if (path === null) return [];
        const node = getNodeAtPath(nodeTree, path);
        if (!node || !isFolder(node)) return [];
        return node.children.map((child) => ({ _id: child._id }));
      },
    },
    canReorder: true as const,
    onDrop: async (
      items: Array<{ getId: () => string }>,
      target: {
        item: { getId: () => string };
        childIndex?: number;
        linearIndex?: number;
      },
      reorderNode: (args: {
        nodeId: Id<"nodes">;
        targetParentId: Id<"nodes"> | null;
        targetIndex: number;
      }) => Promise<void>,
    ) => {
      if (items.length !== 1) return;

      const draggedId = items[0].getId() as Id<"nodes">;
      const targetId = target.item.getId();

      if (draggedId === targetId) return;

      const { parentId, index } = getDropPosition(nodeTree, targetId, target);

      try {
        await reorderNode({
          nodeId: draggedId,
          targetParentId: parentId,
          targetIndex: index,
        });
      } catch (error) {
        console.error("Failed to reorder node:", error);
      }
    },
    indent: 20,
  };
}
