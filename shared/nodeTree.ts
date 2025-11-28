import type { Id, Doc } from "../convex/_generated/dataModel";

export type NodeDoc = Doc<"nodes">;

export interface Node {
  _id: Id<"nodes">;
}

export interface Folder extends Node {
  children: Node[];
}

export type NodeOrFolder = Node | Folder;

export type NodesTree = NodeOrFolder[];

export const isFolder = (node: NodeOrFolder): node is Folder => {
  return "children" in node;
};

export type NodesTreePath = number[];

export const createNodesTreeFromDocs = (docs: NodeDoc[]): NodesTree => {
  // Build a map of children by parentId for efficient lookup
  const childrenByParentId = new Map<string | null, NodeDoc[]>();

  for (const doc of docs) {
    const parentId = doc.parentId;
    const children = childrenByParentId.get(parentId) ?? [];
    children.push(doc);
    childrenByParentId.set(parentId, children);
  }

  // Recursive function to build tree nodes
  const buildTreeNodes = (parentId: string | null): NodeOrFolder[] => {
    const children = childrenByParentId.get(parentId) ?? [];

    // Sort by order
    const sortedChildren = [...children].sort((a, b) => a.order - b.order);

    return sortedChildren.map((doc) => {
      if (doc.kind === "folder") {
        // Recursively get children for folders
        const folderChildren = buildTreeNodes(doc._id);
        return {
          _id: doc._id,
          children: folderChildren,
        };
      }
      // Regular nodes just have _id
      return {
        _id: doc._id,
      };
    });
  };

  // Start with root nodes (parentId === null)
  return buildTreeNodes(null);
};

export const findNodePath = ({
  tree,
  nodeId,
}: {
  tree: NodesTree;
  nodeId: Id<"nodes">;
}): NodesTreePath | null => {
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i];
    if (node._id === nodeId) return [i];
    if (isFolder(node)) {
      const childPath = findNodePath({ tree: node.children, nodeId });
      if (childPath !== null) return [i, ...childPath];
    }
  }
  return null;
};

export const getNodeAtPath = (
  tree: NodesTree,
  path: NodesTreePath,
): NodeOrFolder | null => {
  if (path.length === 0) return null;
  const [index, ...rest] = path;

  if (index < 0 || index >= tree.length) return null;
  const node = tree[index];

  if (rest.length === 0) return node;

  if (!isFolder(node)) return null;
  return getNodeAtPath(node.children, rest);
};

const isPathDescendantOf = (
  descendantPath: NodesTreePath,
  ancestorPath: NodesTreePath,
): boolean => {
  if (descendantPath.length <= ancestorPath.length) return false;
  for (let i = 0; i < ancestorPath.length; i++)
    if (descendantPath[i] !== ancestorPath[i]) return false;
  return true;
};

const removeNodeAtPath = (tree: NodesTree, path: NodesTreePath): NodesTree => {
  if (path.length === 0) return tree;
  const [index, ...rest] = path;

  if (index < 0 || index >= tree.length) return tree;

  if (rest.length === 0) {
    const result = [...tree];
    result.splice(index, 1);
    return result;
  }

  const node = tree[index];
  if (!isFolder(node)) return tree;

  const result = [...tree];
  result[index] = {
    ...node,
    children: removeNodeAtPath(node.children, rest),
  };
  return result;
};

const insertNodeAtPath = (
  tree: NodesTree,
  path: NodesTreePath,
  node: NodeOrFolder,
): NodesTree => {
  if (path.length === 0) return tree;
  const [index, ...rest] = path;

  if (rest.length === 0) {
    const result = [...tree];
    const insertIndex = Math.min(Math.max(index, 0), result.length);
    result.splice(insertIndex, 0, node);
    return result;
  }

  if (index < 0 || index >= tree.length) return tree;

  const targetNode = tree[index];
  if (!isFolder(targetNode))
    throw new Error("Cannot insert into non-folder node");

  const result = [...tree];
  result[index] = {
    ...targetNode,
    children: insertNodeAtPath(targetNode.children, rest, node),
  };
  return result;
};

export const moveNode = ({
  tree,
  nodeId,
  path,
}: {
  tree: NodesTree;
  nodeId: Id<"nodes">;
  path: NodesTreePath;
}): NodesTree => {
  const sourcePath = findNodePath({ tree, nodeId });
  if (sourcePath === null) throw new Error(`Node with id ${nodeId} not found`);

  const nodeToMove = getNodeAtPath(tree, sourcePath);
  if (nodeToMove === null) throw new Error(`Node at source path not found`);

  if (isFolder(nodeToMove))
    if (isPathDescendantOf(path, sourcePath))
      throw new Error("Cannot move a folder into itself or its descendants");

  const treeWithoutSource = removeNodeAtPath(tree, sourcePath);
  const adjustedPath = adjustPathAfterRemoval(sourcePath, path);
  return insertNodeAtPath(treeWithoutSource, adjustedPath, nodeToMove);
};

const adjustPathAfterRemoval = (
  removalPath: NodesTreePath,
  targetPath: NodesTreePath,
): NodesTreePath => {
  for (let i = 0; i < removalPath.length && i < targetPath.length; i++) {
    if (removalPath[i] < targetPath[i]) {
      // If removing the node at this level (removalPath ends here)
      if (removalPath.length === i + 1) {
        // Quirk: If target also ends here (sibling), don't decrement
        if (targetPath.length === i + 1) return targetPath;

        // Otherwise (descendant), decrement
        const newPath = [...targetPath];
        newPath[i]--;
        return newPath;
      }
      // If removing a descendant, no shift
      return targetPath;
    }
    if (removalPath[i] > targetPath[i]) return targetPath;
  }

  return targetPath;
};

export type Patch = {
  _id: Id<"nodes">;
  parentId?: Id<"nodes"> | null;
  order?: number;
};

const flattenTreeToMap = (
  tree: NodesTree,
  parentId: Id<"nodes"> | null = null,
): Map<string, { parentId: Id<"nodes"> | null; order: number }> => {
  const map = new Map<
    string,
    { parentId: Id<"nodes"> | null; order: number }
  >();
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i];
    map.set(node._id, { parentId, order: i });
    if (isFolder(node)) {
      const childrenMap = flattenTreeToMap(node.children, node._id);
      for (const [id, state] of childrenMap) map.set(id, state);
    }
  }
  return map;
};

export const listPatches = (
  oldTree: NodesTree,
  newTree: NodesTree,
): Patch[] => {
  const oldMap = flattenTreeToMap(oldTree);
  const newMap = flattenTreeToMap(newTree);
  const patches: Patch[] = [];

  for (const [id, newState] of newMap) {
    const oldState = oldMap.get(id);
    if (!oldState) continue;

    const parentChanged = newState.parentId !== oldState.parentId;
    const orderChanged = newState.order !== oldState.order;

    if (parentChanged || orderChanged) {
      const patch: Patch = { _id: id as Id<"nodes"> };
      if (parentChanged) patch.parentId = newState.parentId;
      if (parentChanged || orderChanged) patch.order = newState.order;
      patches.push(patch);
    }
  }

  return patches;
};

export const applyPatches = (tree: NodesTree, patches: Patch[]): NodesTree => {
  // 1. Flatten current tree to capture initial state
  const nodeState = new Map<
    string,
    {
      parentId: Id<"nodes"> | null;
      order: number;
      isFolder: boolean;
      originalNode: NodeOrFolder; // Keep reference to preserve other props if any (though strict types say no)
    }
  >();

  const flatten = (nodes: NodesTree, parentId: Id<"nodes"> | null) => {
    nodes.forEach((node, index) => {
      nodeState.set(node._id, {
        parentId,
        order: index,
        isFolder: isFolder(node),
        originalNode: node,
      });
      if (isFolder(node)) flatten(node.children, node._id);
    });
  };
  flatten(tree, null);

  // 2. Apply patches
  for (const patch of patches) {
    const state = nodeState.get(patch._id);
    if (!state) continue; // Should not happen if patches are valid for this tree

    if (patch.parentId !== undefined) state.parentId = patch.parentId;
    if (patch.order !== undefined) state.order = patch.order;
  }

  // 3. Reconstruct tree
  const childrenByParentId = new Map<
    string | null,
    Array<{ id: string; order: number }>
  >();

  for (const [id, state] of nodeState) {
    const parentId = state.parentId;
    const children = childrenByParentId.get(parentId) ?? [];
    children.push({ id, order: state.order });
    childrenByParentId.set(parentId, children);
  }

  const buildTree = (parentId: string | null): NodesTree => {
    const children = childrenByParentId.get(parentId) ?? [];
    // Sort by order
    children.sort((a, b) => a.order - b.order);

    return children.map((child) => {
      const state = nodeState.get(child.id);
      if (!state) throw new Error(`Missing state for node ${child.id}`);
      const original = state.originalNode;

      if (state.isFolder)
        return {
          ...original,
          children: buildTree(child.id),
        };

      return { ...original };
    });
  };

  return buildTree(null);
};
