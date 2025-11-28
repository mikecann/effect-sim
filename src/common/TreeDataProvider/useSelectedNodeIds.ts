import { useMemo } from "react";
import type { NodesTree } from "../../../shared/nodeTree";
import type { Id } from "../../../convex/_generated/dataModel";

export function useSelectedNodeIds(
  nodeTree: NodesTree | null,
  selectedItems: string[],
): Array<Id<"nodes">> {
  return useMemo(() => {
    if (!nodeTree) return [];
    const ids: Array<Id<"nodes">> = [];
    for (const itemId of selectedItems) {
      if (itemId === "root") continue;
      // In the new structure, itemId is already the node ID
      ids.push(itemId as Id<"nodes">);
    }
    return Array.from(new Set(ids));
  }, [nodeTree, selectedItems]);
}
