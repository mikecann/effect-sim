import type { NodeKey } from "../../../shared/models/docs";
import { useMemo } from "react";
import type { NodesTree } from "../../../shared/nodeTree";

export function useSelectedNodeIds(
  nodeTree: NodesTree | null,
  selectedItems: string[],
): Array<NodeKey> {
  return useMemo(() => {
    if (!nodeTree) return [];
    const ids: Array<NodeKey> = [];
    for (const itemId of selectedItems) {
      if (itemId === "root") continue;
      // In the new structure, itemId is already the node ID
      ids.push(itemId as NodeKey);
    }
    return Array.from(new Set(ids));
  }, [nodeTree, selectedItems]);
}
