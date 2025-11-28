import type { NodesTree } from "../../../shared/nodeTree";
import type { Id } from "../../../convex/_generated/dataModel";
import { findNodePath, getNodeAtPath, isFolder } from "../../../shared/nodeTree";

function getParentIdFromPath(
  tree: NodesTree,
  path: number[],
): Id<"nodes"> | null {
  if (path.length <= 1) return null;
  const parentPath = path.slice(0, -1);
  const parentNode = getNodeAtPath(tree, parentPath);
  return parentNode?._id ?? null;
}

function getSiblings(
  tree: NodesTree,
  path: number[],
): Array<{ _id: Id<"nodes"> }> {
  if (path.length === 0) return tree;
  if (path.length === 1) return tree;
  const parentPath = path.slice(0, -1);
  const parentNode = getNodeAtPath(tree, parentPath);
  if (!parentNode || !isFolder(parentNode)) return [];
  return parentNode.children;
}

export function getDropPosition(
  nodeTree: NodesTree | null,
  targetId: string,
  target: { childIndex?: number; linearIndex?: number },
): { parentId: Id<"nodes"> | null; index: number } {
  if (!nodeTree) return { parentId: null, index: 0 };

  // Root level drop
  if (targetId === "root")
    return {
      parentId: null,
      index:
        "childIndex" in target && target.childIndex !== undefined
          ? target.childIndex
          : nodeTree.length,
    };

  const targetPath = findNodePath({
    tree: nodeTree,
    nodeId: targetId as Id<"nodes">,
  });
  if (targetPath === null) return { parentId: null, index: 0 };
  const targetNode = getNodeAtPath(nodeTree, targetPath);
  if (!targetNode) return { parentId: null, index: 0 };

  // Dropping as child of folder (has childIndex)
  if ("childIndex" in target && target.childIndex !== undefined) {
    if (isFolder(targetNode))
      return {
        parentId: targetId as Id<"nodes">,
        index: target.childIndex,
      };

    // childIndex but not a folder means dropping between siblings
    const parentId = getParentIdFromPath(nodeTree, targetPath);
    return {
      parentId,
      index: target.childIndex,
    };
  }

  // Dropping between items (has linearIndex)
  if ("linearIndex" in target) {
    const parentId = getParentIdFromPath(nodeTree, targetPath);
    const siblings = getSiblings(nodeTree, targetPath);
    const targetPos = siblings.findIndex((n) => n._id === targetId);
    return {
      parentId,
      index: targetPos >= 0 ? targetPos + 1 : siblings.length,
    };
  }

  // Direct drop on item (no position info)
  if (isFolder(targetNode))
    return {
      parentId: targetId as Id<"nodes">,
      index: targetNode.children.length,
    };

  // Drop on string - place after it as sibling
  const parentId = getParentIdFromPath(nodeTree, targetPath);
  const siblings = getSiblings(nodeTree, targetPath);
  const targetPos = siblings.findIndex((n) => n._id === targetId);

  return {
    parentId,
    index: targetPos >= 0 ? targetPos + 1 : siblings.length,
  };
}
