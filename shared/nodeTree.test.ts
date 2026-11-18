import { test, expect, describe, it } from "vitest";
import type { NodeDoc } from "./nodeTree";
import {
  createNodesTreeFromDocs,
  findNodePath,
  listPatches,
  applyPatches,
  moveNode,
  NodesTree,
} from "./nodeTree";

type FolderNodeDoc = NodeDoc & { kind: "folder" };

const createNodeDoc = (
  overrides?: Omit<Partial<NodeDoc>, "key" | "parentId"> & {
    key?: string;
    parentId?: string;
  },
): NodeDoc => {
  return {
    key: "1",
    parentId: null,
    order: 0,
    ...overrides,
  } as NodeDoc;
};

export const createFolderDoc = (
  overrides?: Omit<Partial<FolderNodeDoc>, "key" | "parentId"> & {
    key?: string;
    parentId?: string;
  },
): FolderNodeDoc => {
  return {
    key: "1",
    parentId: null,
    order: 0,
    kind: "folder",
    label: "",
    ...overrides,
  } as FolderNodeDoc;
};

describe("createNodesTreeFromDoc", () => {
  it("handles one node", () => {
    const tree = createNodesTreeFromDocs([createNodeDoc({ key: "a" })]);
    expect(tree).toEqual([{ key: "a" }]);
  });

  it("handles multiple flat nodes", () => {
    const tree = createNodesTreeFromDocs([
      createNodeDoc({ key: "a", order: 10 }),
      createNodeDoc({ key: "c", order: 2 }),
      createNodeDoc({ key: "b", order: 0 }),
    ]);
    expect(tree).toEqual([{ key: "b" }, { key: "c" }, { key: "a" }]);
  });

  it("handles one folder", () => {
    const tree = createNodesTreeFromDocs([
      createFolderDoc({ key: "folder-a", order: 10 }),
    ]);
    expect(tree).toEqual([{ key: "folder-a", children: [] }]);
  });

  it("handles two folders", () => {
    const tree = createNodesTreeFromDocs([
      createFolderDoc({ key: "folder-a", order: 2 }),
      createFolderDoc({ key: "folder-b", order: 0 }),
    ]);
    expect(tree).toEqual([
      { key: "folder-b", children: [] },
      { key: "folder-a", children: [] },
    ]);
  });

  it("handles a folder and children", () => {
    const tree = createNodesTreeFromDocs([
      createNodeDoc({ key: "a", order: 0 }),
      createNodeDoc({ key: "c", order: 2 }),
      createFolderDoc({ key: "folder-a", order: 1 }),
      createNodeDoc({ key: "b", order: 3 }),
    ]);
    expect(tree).toEqual([
      { key: "a" },
      { key: "folder-a", children: [] },
      { key: "c" },
      { key: "b" },
    ]);
  });

  it("handles a folder with children and children", () => {
    const tree = createNodesTreeFromDocs([
      createNodeDoc({ key: "a", order: 0 }),
      createNodeDoc({
        key: "folder-a-b",
        order: 1,
        parentId: "folder-a",
      }),
      createNodeDoc({
        key: "folder-a-a",
        order: 0,
        parentId: "folder-a",
      }),
      createNodeDoc({ key: "c", order: 2 }),
      createFolderDoc({ key: "folder-a", order: 1 }),
      createNodeDoc({ key: "b", order: 3 }),
    ]);
    expect(tree).toEqual([
      { key: "a" },
      {
        key: "folder-a",
        children: [{ key: "folder-a-a" }, { key: "folder-a-b" }],
      },
      { key: "c" },
      { key: "b" },
    ]);
  });

  it("handles nested folders with children", () => {
    const tree = createNodesTreeFromDocs([
      createNodeDoc({ key: "a", order: 0 }),
      createFolderDoc({
        key: "folder-a-folder-a",
        order: 1,
        parentId: "folder-a",
      }),
      createNodeDoc({
        key: "folder-a-folder-a-a",
        order: 0,
        parentId: "folder-a-folder-a",
      }),
      createNodeDoc({ key: "c", order: 2 }),
      createFolderDoc({ key: "folder-a", order: 1 }),
      createNodeDoc({ key: "b", order: 3 }),
    ]);
    expect(tree).toEqual([
      { key: "a" },
      {
        key: "folder-a",
        children: [
          {
            key: "folder-a-folder-a",
            children: [{ key: "folder-a-folder-a-a" }],
          },
        ],
      },
      { key: "c" },
      { key: "b" },
    ]);
  });

  it("handles empty array", () => {
    const tree = createNodesTreeFromDocs([]);
    expect(tree).toEqual([]);
  });

  it("handles folder with mixed children (nodes and folders)", () => {
    const tree = createNodesTreeFromDocs([
      createFolderDoc({ key: "folder-a", order: 0 }),
      createNodeDoc({
        key: "node-1",
        order: 0,
        parentId: "folder-a",
      }),
      createFolderDoc({
        key: "folder-b",
        order: 1,
        parentId: "folder-a",
      }),
      createNodeDoc({
        key: "node-2",
        order: 2,
        parentId: "folder-a",
      }),
    ]);
    expect(tree).toEqual([
      {
        key: "folder-a",
        children: [
          { key: "node-1" },
          { key: "folder-b", children: [] },
          { key: "node-2" },
        ],
      },
    ]);
  });

  it("handles multiple folders with children", () => {
    const tree = createNodesTreeFromDocs([
      createFolderDoc({ key: "folder-a", order: 0 }),
      createNodeDoc({
        key: "folder-a-child-1",
        order: 0,
        parentId: "folder-a",
      }),
      createNodeDoc({
        key: "folder-a-child-2",
        order: 1,
        parentId: "folder-a",
      }),
      createFolderDoc({ key: "folder-b", order: 1 }),
      createNodeDoc({
        key: "folder-b-child-1",
        order: 0,
        parentId: "folder-b",
      }),
    ]);
    expect(tree).toEqual([
      {
        key: "folder-a",
        children: [{ key: "folder-a-child-1" }, { key: "folder-a-child-2" }],
      },
      {
        key: "folder-b",
        children: [{ key: "folder-b-child-1" }],
      },
    ]);
  });

  it("handles orphaned nodes (parentId that doesn't exist)", () => {
    const tree = createNodesTreeFromDocs([
      createNodeDoc({ key: "a", order: 0 }),
      createNodeDoc({
        key: "orphan",
        order: 0,
        parentId: "non-existent-parent",
      }),
      createNodeDoc({ key: "b", order: 1 }),
    ]);
    expect(tree).toEqual([{ key: "a" }, { key: "b" }]);
  });

  it("handles negative order values", () => {
    const tree = createNodesTreeFromDocs([
      createNodeDoc({ key: "a", order: 10 }),
      createNodeDoc({ key: "b", order: -5 }),
      createNodeDoc({ key: "c", order: 0 }),
      createNodeDoc({ key: "d", order: -10 }),
    ]);
    expect(tree).toEqual([
      { key: "d" },
      { key: "b" },
      { key: "c" },
      { key: "a" },
    ]);
  });

  it("handles nodes with same order values", () => {
    const tree = createNodesTreeFromDocs([
      createNodeDoc({ key: "a", order: 0 }),
      createNodeDoc({ key: "b", order: 0 }),
      createNodeDoc({ key: "c", order: 0 }),
    ]);
    expect(tree).toHaveLength(3);
    expect(tree.map((n) => n.key)).toContain("a");
    expect(tree.map((n) => n.key)).toContain("b");
    expect(tree.map((n) => n.key)).toContain("c");
  });

  it("handles deep nesting (3+ levels)", () => {
    const tree = createNodesTreeFromDocs([
      createFolderDoc({ key: "level1", order: 0 }),
      createFolderDoc({
        key: "level2",
        order: 0,
        parentId: "level1",
      }),
      createFolderDoc({
        key: "level3",
        order: 0,
        parentId: "level2",
      }),
      createNodeDoc({
        key: "level4-node",
        order: 0,
        parentId: "level3",
      }),
    ]);
    expect(tree).toEqual([
      {
        key: "level1",
        children: [
          {
            key: "level2",
            children: [
              {
                key: "level3",
                children: [{ key: "level4-node" }],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("handles complex nested structure with mixed nodes and folders", () => {
    const tree = createNodesTreeFromDocs([
      createFolderDoc({ key: "root-folder-1", order: 0 }),
      createNodeDoc({
        key: "root-folder-1-node-1",
        order: 0,
        parentId: "root-folder-1",
      }),
      createFolderDoc({
        key: "root-folder-1-subfolder",
        order: 1,
        parentId: "root-folder-1",
      }),
      createNodeDoc({
        key: "root-folder-1-subfolder-node",
        order: 0,
        parentId: "root-folder-1-subfolder",
      }),
      createNodeDoc({
        key: "root-folder-1-node-2",
        order: 2,
        parentId: "root-folder-1",
      }),
      createNodeDoc({ key: "root-node", order: 1 }),
      createFolderDoc({ key: "root-folder-2", order: 2 }),
    ]);
    expect(tree).toEqual([
      {
        key: "root-folder-1",
        children: [
          { key: "root-folder-1-node-1" },
          {
            key: "root-folder-1-subfolder",
            children: [{ key: "root-folder-1-subfolder-node" }],
          },
          { key: "root-folder-1-node-2" },
        ],
      },
      { key: "root-node" },
      { key: "root-folder-2", children: [] },
    ]);
  });
});

describe("findNodePath", () => {
  it("returns null if node is not found", () => {
    const tree = [{ key: "a" }] as NodesTree;
    const path = findNodePath({ tree, nodeId: "b" });
    expect(path).toEqual(null);
  });

  it("returns null for empty tree", () => {
    const tree = [] as NodesTree;
    const path = findNodePath({ tree, nodeId: "a" });
    expect(path).toEqual(null);
  });

  it("returns path to root node", () => {
    const tree = [{ key: "a" }] as NodesTree;
    const path = findNodePath({ tree, nodeId: "a" });
    expect(path).toEqual([0]);
  });

  it("returns path to root node at different index", () => {
    const tree = [{ key: "a" }, { key: "b" }, { key: "c" }] as NodesTree;
    const path = findNodePath({ tree, nodeId: "b" });
    expect(path).toEqual([1]);
  });

  it("returns path to folder at root level", () => {
    const tree = [{ key: "a" }, { key: "folder-a", children: [] }] as NodesTree;
    const path = findNodePath({ tree, nodeId: "folder-a" });
    expect(path).toEqual([1]);
  });

  it("returns path to child node", () => {
    const tree = [
      { key: "a" },
      { key: "folder-a", children: [{ key: "folder-a-a" }] },
    ] as NodesTree;
    const path = findNodePath({ tree, nodeId: "folder-a-a" });
    expect(path).toEqual([1, 0]);
  });

  it("returns path to second child in folder", () => {
    const tree = [
      { key: "folder-a", children: [{ key: "child-1" }, { key: "child-2" }] },
    ] as NodesTree;
    const path = findNodePath({ tree, nodeId: "child-2" });
    expect(path).toEqual([0, 1]);
  });

  it("returns path to node in second folder", () => {
    const tree = [
      { key: "folder-a", children: [{ key: "child-a" }] },
      { key: "folder-b", children: [{ key: "child-b" }] },
    ] as NodesTree;
    const path = findNodePath({ tree, nodeId: "child-b" });
    expect(path).toEqual([1, 0]);
  });

  it("returns path to deeply nested node (3 levels)", () => {
    const tree = [
      {
        key: "level1",
        children: [
          {
            key: "level2",
            children: [{ key: "level3-node" }],
          },
        ],
      },
    ] as unknown as NodesTree;
    const path = findNodePath({ tree, nodeId: "level3-node" });
    expect(path).toEqual([0, 0, 0]);
  });

  it("returns path to node in folder with multiple siblings", () => {
    const tree = [
      {
        key: "folder-a",
        children: [{ key: "child-1" }, { key: "child-2" }, { key: "child-3" }],
      },
    ] as NodesTree;
    const path = findNodePath({ tree, nodeId: "child-2" });
    expect(path).toEqual([0, 1]);
  });

  it("returns path to nested folder", () => {
    const tree = [
      {
        key: "folder-a",
        children: [
          { key: "node-1" },
          { key: "folder-b", children: [] },
          { key: "node-2" },
        ],
      },
    ] as NodesTree;
    const path = findNodePath({ tree, nodeId: "folder-b" });
    expect(path).toEqual([0, 1]);
  });
});

describe("moveNode", () => {
  it("moves a root node to a different root position", () => {
    const tree = [{ key: "a" }, { key: "b" }, { key: "c" }] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "a",
      path: [2],
    });
    expect(result).toEqual([{ key: "b" }, { key: "c" }, { key: "a" }]);
  });

  it("moves a root node into a folder", () => {
    const tree = [
      { key: "a" },
      { key: "folder-a", children: [{ key: "folder-a-child" }] },
    ] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "a",
      path: [1, 1],
    });
    expect(result).toEqual([
      {
        key: "folder-a",
        children: [{ key: "folder-a-child" }, { key: "a" }],
      },
    ]);
  });

  it("moves a node from a folder to root", () => {
    const tree = [
      { key: "folder-a", children: [{ key: "child-a" }, { key: "child-b" }] },
      { key: "root-node" },
    ] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "child-a",
      path: [1],
    });
    expect(result).toEqual([
      { key: "folder-a", children: [{ key: "child-b" }] },
      { key: "child-a" },
      { key: "root-node" },
    ]);
  });

  it("moves a node from one folder to another folder", () => {
    const tree = [
      { key: "folder-a", children: [{ key: "child-a" }] },
      { key: "folder-b", children: [{ key: "child-b" }] },
    ] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "child-a",
      path: [1, 1],
    });
    expect(result).toEqual([
      { key: "folder-a", children: [] },
      {
        key: "folder-b",
        children: [{ key: "child-b" }, { key: "child-a" }],
      },
    ]);
  });

  it("moves a folder (not just nodes)", () => {
    const tree = [
      { key: "folder-a", children: [{ key: "child-a" }] },
      { key: "folder-b", children: [{ key: "child-b" }] },
      { key: "root-node" },
    ] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "folder-a",
      path: [1, 1],
    });
    expect(result).toEqual([
      {
        key: "folder-b",
        children: [
          { key: "child-b" },
          { key: "folder-a", children: [{ key: "child-a" }] },
        ],
      },
      { key: "root-node" },
    ]);
  });

  it("moves a node to the beginning of a folder", () => {
    const tree = [
      { key: "a" },
      { key: "folder-a", children: [{ key: "child-1" }, { key: "child-2" }] },
    ] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "a",
      path: [1, 0],
    });
    expect(result).toEqual([
      {
        key: "folder-a",
        children: [{ key: "a" }, { key: "child-1" }, { key: "child-2" }],
      },
    ]);
  });

  it("moves a node within the same folder (reordering)", () => {
    const tree = [
      {
        key: "folder-a",
        children: [{ key: "child-1" }, { key: "child-2" }, { key: "child-3" }],
      },
    ] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "child-1",
      path: [0, 2],
    });
    expect(result).toEqual([
      {
        key: "folder-a",
        children: [{ key: "child-2" }, { key: "child-3" }, { key: "child-1" }],
      },
    ]);
  });

  it("moves a node to an empty folder", () => {
    const tree = [{ key: "a" }, { key: "folder-a", children: [] }] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "a",
      path: [1, 0],
    });
    expect(result).toEqual([{ key: "folder-a", children: [{ key: "a" }] }]);
  });

  it("prevents moving a folder into itself", () => {
    const tree = [
      { key: "folder-a", children: [{ key: "child-a" }] },
    ] as NodesTree;
    expect(() => {
      moveNode({
        tree,
        nodeId: "folder-a",
        path: [0, 0],
      });
    }).toThrow();
  });

  it("prevents moving a folder into one of its direct children", () => {
    const tree = [
      {
        key: "folder-a",
        children: [
          { key: "folder-b", children: [{ key: "child-b" }] },
          { key: "child-a" },
        ],
      },
    ] as NodesTree;
    expect(() => {
      moveNode({
        tree,
        nodeId: "folder-a",
        path: [0, 0, 0],
      });
    }).toThrow();
  });

  it("prevents moving a folder into one of its deeply nested descendants", () => {
    const tree = [
      {
        key: "folder-a",
        children: [
          {
            key: "folder-b",
            children: [
              {
                key: "folder-c",
                children: [{ key: "child-c" }],
              },
            ],
          },
        ],
      },
    ] as unknown as NodesTree;
    expect(() => {
      moveNode({
        tree,
        nodeId: "folder-a",
        path: [0, 0, 0, 0],
      });
    }).toThrow();
  });

  it("prevents moving a node into a folder that is its descendant", () => {
    const tree = [
      {
        key: "folder-a",
        children: [
          {
            key: "folder-b",
            children: [{ key: "child-b" }],
          },
        ],
      },
    ] as unknown as NodesTree;
    expect(() => {
      moveNode({
        tree,
        nodeId: "folder-a",
        path: [0, 0, 0],
      });
    }).toThrow();
  });

  it("allows moving a node to a different position at root level", () => {
    const tree = [{ key: "a" }, { key: "b" }, { key: "c" }] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "c",
      path: [0],
    });
    expect(result).toEqual([{ key: "c" }, { key: "a" }, { key: "b" }]);
  });

  it("moves a folder with children preserving its children", () => {
    const tree = [
      { key: "folder-a", children: [{ key: "child-1" }, { key: "child-2" }] },
      { key: "folder-b", children: [{ key: "child-3" }] },
    ] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "folder-a",
      path: [1, 1],
    });
    expect(result).toEqual([
      {
        key: "folder-b",
        children: [
          { key: "child-3" },
          {
            key: "folder-a",
            children: [{ key: "child-1" }, { key: "child-2" }],
          },
        ],
      },
    ]);
  });
});

describe("listPatches", () => {
  it("returns empty array if trees are the same", () => {
    const oldTree = [{ key: "a" }] as NodesTree;
    const newTree = [{ key: "a" }] as NodesTree;
    const patches = listPatches(oldTree, newTree);
    expect(patches).toEqual([]);
  });

  it("returns a patch to move a node to a different position at root level", () => {
    const oldTree = [{ key: "a" }, { key: "b" }, { key: "c" }] as NodesTree;
    const newTree = [{ key: "c" }, { key: "a" }, { key: "b" }] as NodesTree;
    const patches = listPatches(oldTree, newTree);
    expect(patches).toEqual([
      { key: "c", order: 0 },
      { key: "a", order: 1 },
      { key: "b", order: 2 },
    ]);
  });

  it("returns patches only for nodes that changed order", () => {
    const oldTree = [{ key: "a" }, { key: "b" }, { key: "c" }] as NodesTree;
    const newTree = [{ key: "a" }, { key: "c" }, { key: "b" }] as NodesTree;
    const patches = listPatches(oldTree, newTree);
    expect(patches).toEqual([
      { key: "c", order: 1 },
      { key: "b", order: 2 },
    ]);
  });

  it("returns patches when a node is moved into a folder", () => {
    const oldTree = [
      { key: "folder-a", children: [] },
      { key: "node-a" },
    ] as NodesTree;
    const newTree = [
      {
        key: "folder-a",
        children: [{ key: "node-a" }],
      },
    ] as NodesTree;
    const patches = listPatches(oldTree, newTree);
    expect(patches).toEqual([
      { key: "node-a", parentId: "folder-a", order: 0 },
    ]);
  });

  it("returns patches when a node is moved out of a folder", () => {
    const oldTree = [
      {
        key: "folder-a",
        children: [{ key: "node-a" }],
      },
    ] as NodesTree;
    const newTree = [
      { key: "folder-a", children: [] },
      { key: "node-a" },
    ] as NodesTree;
    const patches = listPatches(oldTree, newTree);
    // In new tree: folder-a at 0, node-a at 1.
    expect(patches).toEqual([{ key: "node-a", parentId: null, order: 1 }]);
  });

  it("returns patches when nodes are reordered inside a folder", () => {
    const oldTree = [
      {
        key: "folder-a",
        children: [{ key: "a" }, { key: "b" }],
      },
    ] as NodesTree;
    const newTree = [
      {
        key: "folder-a",
        children: [{ key: "b" }, { key: "a" }],
      },
    ] as NodesTree;
    const patches = listPatches(oldTree, newTree);
    expect(patches).toEqual([
      { key: "b", order: 0 },
      { key: "a", order: 1 },
    ]);
  });

  it("handles complex structural changes", () => {
    const oldTree = [
      { key: "root-1" },
      {
        key: "folder-a",
        children: [{ key: "child-a" }],
      },
    ] as NodesTree;

    // Move root-1 into folder-a
    // Move child-a to root
    const newTree = [
      {
        key: "folder-a",
        children: [{ key: "root-1" }],
      },
      { key: "child-a" },
    ] as NodesTree;

    const patches = listPatches(oldTree, newTree);

    // folder-a: order 1 -> 0
    // root-1: root (order 0) -> folder-a (order 0)
    // child-a: folder-a (order 0) -> root (order 1)

    // We expect patches for all of them
    const sortedPatches = patches.sort((a, b) => a.key.localeCompare(b.key));

    expect(sortedPatches).toEqual(
      [
        { key: "child-a", parentId: null, order: 1 },
        { key: "folder-a", order: 0 },
        { key: "root-1", parentId: "folder-a", order: 0 },
      ].sort((a, b) => a.key.localeCompare(b.key)),
    );
  });
});

describe("applyPatches", () => {
  it("applies patches to recreate the new tree structure", () => {
    const oldTree = [
      { key: "root-1" },
      {
        key: "folder-a",
        children: [{ key: "child-a" }],
      },
    ] as NodesTree;

    const newTree = [
      {
        key: "folder-a",
        children: [{ key: "root-1" }],
      },
      { key: "child-a" },
    ] as NodesTree;

    const patches = listPatches(oldTree, newTree);
    const applied = applyPatches(oldTree, patches);
    expect(applied).toEqual(newTree);
  });

  it("handles reordering patches", () => {
    const oldTree = [{ key: "a" }, { key: "b" }, { key: "c" }] as NodesTree;
    const newTree = [{ key: "c" }, { key: "a" }, { key: "b" }] as NodesTree;
    const patches = listPatches(oldTree, newTree);
    const applied = applyPatches(oldTree, patches);
    expect(applied).toEqual(newTree);
  });

  it("handles empty patches", () => {
    const tree = [{ key: "a" }] as NodesTree;
    const applied = applyPatches(tree, []);
    expect(applied).toEqual(tree);
  });

  it("handles complex structural changes", () => {
    const oldTree = [
      { key: "folder-a", children: [{ key: "a-1" }, { key: "a-2" }] },
      { key: "folder-b", children: [] },
    ] as NodesTree;

    const newTree = [
      { key: "folder-a", children: [] },
      { key: "folder-b", children: [{ key: "a-2" }, { key: "a-1" }] },
    ] as NodesTree;

    const patches = listPatches(oldTree, newTree);
    const applied = applyPatches(oldTree, patches);
    expect(applied).toEqual(newTree);
  });
});
