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
import { Id } from "../convex/_generated/dataModel";

const createNodeDoc = (
  overrides?: Omit<Partial<NodeDoc>, "_id" | "parentId"> & {
    _id?: string;
    parentId?: string;
  },
): NodeDoc => {
  return {
    _id: "1",
    parentId: null,
    order: 0,
    ...overrides,
  } as NodeDoc;
};

export const createFolderDoc = (
  overrides?: Omit<Partial<FolderNodeDoc>, "_id" | "parentId"> & {
    _id?: string;
    parentId?: string;
  },
): FolderNodeDoc => {
  return {
    _id: "1",
    parentId: null,
    order: 0,
    kind: "folder",
    label: "",
    children: [],
    ...overrides,
  } as FolderNodeDoc;
};

describe("createNodesTreeFromDoc", () => {
  it("handles one node", () => {
    const tree = createNodesTreeFromDocs([createNodeDoc({ _id: "a" })]);
    expect(tree).toEqual([{ _id: "a" }]);
  });

  it("handles multiple flat nodes", () => {
    const tree = createNodesTreeFromDocs([
      createNodeDoc({ _id: "a", order: 10 }),
      createNodeDoc({ _id: "c", order: 2 }),
      createNodeDoc({ _id: "b", order: 0 }),
    ]);
    expect(tree).toEqual([{ _id: "b" }, { _id: "c" }, { _id: "a" }]);
  });

  it("handles one folder", () => {
    const tree = createNodesTreeFromDocs([
      createFolderDoc({ _id: "folder-a", order: 10 }),
    ]);
    expect(tree).toEqual([{ _id: "folder-a", children: [] }]);
  });

  it("handles two folders", () => {
    const tree = createNodesTreeFromDocs([
      createFolderDoc({ _id: "folder-a", order: 2 }),
      createFolderDoc({ _id: "folder-b", order: 0 }),
    ]);
    expect(tree).toEqual([
      { _id: "folder-b", children: [] },
      { _id: "folder-a", children: [] },
    ]);
  });

  it("handles a folder and children", () => {
    const tree = createNodesTreeFromDocs([
      createNodeDoc({ _id: "a", order: 0 }),
      createNodeDoc({ _id: "c", order: 2 }),
      createFolderDoc({ _id: "folder-a", order: 1 }),
      createNodeDoc({ _id: "b", order: 3 }),
    ]);
    expect(tree).toEqual([
      { _id: "a" },
      { _id: "folder-a", children: [] },
      { _id: "c" },
      { _id: "b" },
    ]);
  });

  it("handles a folder with children and children", () => {
    const tree = createNodesTreeFromDocs([
      createNodeDoc({ _id: "a", order: 0 }),
      createNodeDoc({
        _id: "folder-a-b",
        order: 1,
        parentId: "folder-a",
      }),
      createNodeDoc({
        _id: "folder-a-a",
        order: 0,
        parentId: "folder-a",
      }),
      createNodeDoc({ _id: "c", order: 2 }),
      createFolderDoc({ _id: "folder-a", order: 1 }),
      createNodeDoc({ _id: "b", order: 3 }),
    ]);
    expect(tree).toEqual([
      { _id: "a" },
      {
        _id: "folder-a",
        children: [{ _id: "folder-a-a" }, { _id: "folder-a-b" }],
      },
      { _id: "c" },
      { _id: "b" },
    ]);
  });

  it("handles nested folders with children", () => {
    const tree = createNodesTreeFromDocs([
      createNodeDoc({ _id: "a", order: 0 }),
      createFolderDoc({
        _id: "folder-a-folder-a",
        order: 1,
        parentId: "folder-a",
      }),
      createNodeDoc({
        _id: "folder-a-folder-a-a",
        order: 0,
        parentId: "folder-a-folder-a",
      }),
      createNodeDoc({ _id: "c", order: 2 }),
      createFolderDoc({ _id: "folder-a", order: 1 }),
      createNodeDoc({ _id: "b", order: 3 }),
    ]);
    expect(tree).toEqual([
      { _id: "a" },
      {
        _id: "folder-a",
        children: [
          {
            _id: "folder-a-folder-a",
            children: [{ _id: "folder-a-folder-a-a" }],
          },
        ],
      },
      { _id: "c" },
      { _id: "b" },
    ]);
  });

  it("handles empty array", () => {
    const tree = createNodesTreeFromDocs([]);
    expect(tree).toEqual([]);
  });

  it("handles folder with mixed children (nodes and folders)", () => {
    const tree = createNodesTreeFromDocs([
      createFolderDoc({ _id: "folder-a", order: 0 }),
      createNodeDoc({
        _id: "node-1",
        order: 0,
        parentId: "folder-a",
      }),
      createFolderDoc({
        _id: "folder-b",
        order: 1,
        parentId: "folder-a",
      }),
      createNodeDoc({
        _id: "node-2",
        order: 2,
        parentId: "folder-a",
      }),
    ]);
    expect(tree).toEqual([
      {
        _id: "folder-a",
        children: [
          { _id: "node-1" },
          { _id: "folder-b", children: [] },
          { _id: "node-2" },
        ],
      },
    ]);
  });

  it("handles multiple folders with children", () => {
    const tree = createNodesTreeFromDocs([
      createFolderDoc({ _id: "folder-a", order: 0 }),
      createNodeDoc({
        _id: "folder-a-child-1",
        order: 0,
        parentId: "folder-a",
      }),
      createNodeDoc({
        _id: "folder-a-child-2",
        order: 1,
        parentId: "folder-a",
      }),
      createFolderDoc({ _id: "folder-b", order: 1 }),
      createNodeDoc({
        _id: "folder-b-child-1",
        order: 0,
        parentId: "folder-b",
      }),
    ]);
    expect(tree).toEqual([
      {
        _id: "folder-a",
        children: [{ _id: "folder-a-child-1" }, { _id: "folder-a-child-2" }],
      },
      {
        _id: "folder-b",
        children: [{ _id: "folder-b-child-1" }],
      },
    ]);
  });

  it("handles orphaned nodes (parentId that doesn't exist)", () => {
    const tree = createNodesTreeFromDocs([
      createNodeDoc({ _id: "a", order: 0 }),
      createNodeDoc({
        _id: "orphan",
        order: 0,
        parentId: "non-existent-parent",
      }),
      createNodeDoc({ _id: "b", order: 1 }),
    ]);
    expect(tree).toEqual([{ _id: "a" }, { _id: "b" }]);
  });

  it("handles negative order values", () => {
    const tree = createNodesTreeFromDocs([
      createNodeDoc({ _id: "a", order: 10 }),
      createNodeDoc({ _id: "b", order: -5 }),
      createNodeDoc({ _id: "c", order: 0 }),
      createNodeDoc({ _id: "d", order: -10 }),
    ]);
    expect(tree).toEqual([
      { _id: "d" },
      { _id: "b" },
      { _id: "c" },
      { _id: "a" },
    ]);
  });

  it("handles nodes with same order values", () => {
    const tree = createNodesTreeFromDocs([
      createNodeDoc({ _id: "a", order: 0 }),
      createNodeDoc({ _id: "b", order: 0 }),
      createNodeDoc({ _id: "c", order: 0 }),
    ]);
    expect(tree).toHaveLength(3);
    expect(tree.map((n) => n._id)).toContain("a");
    expect(tree.map((n) => n._id)).toContain("b");
    expect(tree.map((n) => n._id)).toContain("c");
  });

  it("handles deep nesting (3+ levels)", () => {
    const tree = createNodesTreeFromDocs([
      createFolderDoc({ _id: "level1", order: 0 }),
      createFolderDoc({
        _id: "level2",
        order: 0,
        parentId: "level1",
      }),
      createFolderDoc({
        _id: "level3",
        order: 0,
        parentId: "level2",
      }),
      createNodeDoc({
        _id: "level4-node",
        order: 0,
        parentId: "level3",
      }),
    ]);
    expect(tree).toEqual([
      {
        _id: "level1",
        children: [
          {
            _id: "level2",
            children: [
              {
                _id: "level3",
                children: [{ _id: "level4-node" }],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("handles complex nested structure with mixed nodes and folders", () => {
    const tree = createNodesTreeFromDocs([
      createFolderDoc({ _id: "root-folder-1", order: 0 }),
      createNodeDoc({
        _id: "root-folder-1-node-1",
        order: 0,
        parentId: "root-folder-1",
      }),
      createFolderDoc({
        _id: "root-folder-1-subfolder",
        order: 1,
        parentId: "root-folder-1",
      }),
      createNodeDoc({
        _id: "root-folder-1-subfolder-node",
        order: 0,
        parentId: "root-folder-1-subfolder",
      }),
      createNodeDoc({
        _id: "root-folder-1-node-2",
        order: 2,
        parentId: "root-folder-1",
      }),
      createNodeDoc({ _id: "root-node", order: 1 }),
      createFolderDoc({ _id: "root-folder-2", order: 2 }),
    ]);
    expect(tree).toEqual([
      {
        _id: "root-folder-1",
        children: [
          { _id: "root-folder-1-node-1" },
          {
            _id: "root-folder-1-subfolder",
            children: [{ _id: "root-folder-1-subfolder-node" }],
          },
          { _id: "root-folder-1-node-2" },
        ],
      },
      { _id: "root-node" },
      { _id: "root-folder-2", children: [] },
    ]);
  });
});

describe("findNodePath", () => {
  it("returns null if node is not found", () => {
    const tree = [{ _id: "a" }] as NodesTree;
    const path = findNodePath({ tree, nodeId: "b" as Id<"nodes"> });
    expect(path).toEqual(null);
  });

  it("returns null for empty tree", () => {
    const tree = [] as NodesTree;
    const path = findNodePath({ tree, nodeId: "a" as Id<"nodes"> });
    expect(path).toEqual(null);
  });

  it("returns path to root node", () => {
    const tree = [{ _id: "a" }] as NodesTree;
    const path = findNodePath({ tree, nodeId: "a" as Id<"nodes"> });
    expect(path).toEqual([0]);
  });

  it("returns path to root node at different index", () => {
    const tree = [{ _id: "a" }, { _id: "b" }, { _id: "c" }] as NodesTree;
    const path = findNodePath({ tree, nodeId: "b" as Id<"nodes"> });
    expect(path).toEqual([1]);
  });

  it("returns path to folder at root level", () => {
    const tree = [{ _id: "a" }, { _id: "folder-a", children: [] }] as NodesTree;
    const path = findNodePath({ tree, nodeId: "folder-a" as Id<"nodes"> });
    expect(path).toEqual([1]);
  });

  it("returns path to child node", () => {
    const tree = [
      { _id: "a" },
      { _id: "folder-a", children: [{ _id: "folder-a-a" }] },
    ] as NodesTree;
    const path = findNodePath({ tree, nodeId: "folder-a-a" as Id<"nodes"> });
    expect(path).toEqual([1, 0]);
  });

  it("returns path to second child in folder", () => {
    const tree = [
      { _id: "folder-a", children: [{ _id: "child-1" }, { _id: "child-2" }] },
    ] as NodesTree;
    const path = findNodePath({ tree, nodeId: "child-2" as Id<"nodes"> });
    expect(path).toEqual([0, 1]);
  });

  it("returns path to node in second folder", () => {
    const tree = [
      { _id: "folder-a", children: [{ _id: "child-a" }] },
      { _id: "folder-b", children: [{ _id: "child-b" }] },
    ] as NodesTree;
    const path = findNodePath({ tree, nodeId: "child-b" as Id<"nodes"> });
    expect(path).toEqual([1, 0]);
  });

  it("returns path to deeply nested node (3 levels)", () => {
    const tree = [
      {
        _id: "level1",
        children: [
          {
            _id: "level2",
            children: [{ _id: "level3-node" }],
          },
        ],
      },
    ] as unknown as NodesTree;
    const path = findNodePath({ tree, nodeId: "level3-node" as Id<"nodes"> });
    expect(path).toEqual([0, 0, 0]);
  });

  it("returns path to node in folder with multiple siblings", () => {
    const tree = [
      {
        _id: "folder-a",
        children: [{ _id: "child-1" }, { _id: "child-2" }, { _id: "child-3" }],
      },
    ] as NodesTree;
    const path = findNodePath({ tree, nodeId: "child-2" as Id<"nodes"> });
    expect(path).toEqual([0, 1]);
  });

  it("returns path to nested folder", () => {
    const tree = [
      {
        _id: "folder-a",
        children: [
          { _id: "node-1" },
          { _id: "folder-b", children: [] },
          { _id: "node-2" },
        ],
      },
    ] as NodesTree;
    const path = findNodePath({ tree, nodeId: "folder-b" as Id<"nodes"> });
    expect(path).toEqual([0, 1]);
  });
});

describe("moveNode", () => {
  it("moves a root node to a different root position", () => {
    const tree = [{ _id: "a" }, { _id: "b" }, { _id: "c" }] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "a" as Id<"nodes">,
      path: [2],
    });
    expect(result).toEqual([{ _id: "b" }, { _id: "c" }, { _id: "a" }]);
  });

  it("moves a root node into a folder", () => {
    const tree = [
      { _id: "a" },
      { _id: "folder-a", children: [{ _id: "folder-a-child" }] },
    ] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "a" as Id<"nodes">,
      path: [1, 1],
    });
    expect(result).toEqual([
      {
        _id: "folder-a",
        children: [{ _id: "folder-a-child" }, { _id: "a" }],
      },
    ]);
  });

  it("moves a node from a folder to root", () => {
    const tree = [
      { _id: "folder-a", children: [{ _id: "child-a" }, { _id: "child-b" }] },
      { _id: "root-node" },
    ] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "child-a" as Id<"nodes">,
      path: [1],
    });
    expect(result).toEqual([
      { _id: "folder-a", children: [{ _id: "child-b" }] },
      { _id: "child-a" },
      { _id: "root-node" },
    ]);
  });

  it("moves a node from one folder to another folder", () => {
    const tree = [
      { _id: "folder-a", children: [{ _id: "child-a" }] },
      { _id: "folder-b", children: [{ _id: "child-b" }] },
    ] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "child-a" as Id<"nodes">,
      path: [1, 1],
    });
    expect(result).toEqual([
      { _id: "folder-a", children: [] },
      {
        _id: "folder-b",
        children: [{ _id: "child-b" }, { _id: "child-a" }],
      },
    ]);
  });

  it("moves a folder (not just nodes)", () => {
    const tree = [
      { _id: "folder-a", children: [{ _id: "child-a" }] },
      { _id: "folder-b", children: [{ _id: "child-b" }] },
      { _id: "root-node" },
    ] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "folder-a" as Id<"nodes">,
      path: [1, 1],
    });
    expect(result).toEqual([
      {
        _id: "folder-b",
        children: [
          { _id: "child-b" },
          { _id: "folder-a", children: [{ _id: "child-a" }] },
        ],
      },
      { _id: "root-node" },
    ]);
  });

  it("moves a node to the beginning of a folder", () => {
    const tree = [
      { _id: "a" },
      { _id: "folder-a", children: [{ _id: "child-1" }, { _id: "child-2" }] },
    ] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "a" as Id<"nodes">,
      path: [1, 0],
    });
    expect(result).toEqual([
      {
        _id: "folder-a",
        children: [{ _id: "a" }, { _id: "child-1" }, { _id: "child-2" }],
      },
    ]);
  });

  it("moves a node within the same folder (reordering)", () => {
    const tree = [
      {
        _id: "folder-a",
        children: [{ _id: "child-1" }, { _id: "child-2" }, { _id: "child-3" }],
      },
    ] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "child-1" as Id<"nodes">,
      path: [0, 2],
    });
    expect(result).toEqual([
      {
        _id: "folder-a",
        children: [{ _id: "child-2" }, { _id: "child-3" }, { _id: "child-1" }],
      },
    ]);
  });

  it("moves a node to an empty folder", () => {
    const tree = [{ _id: "a" }, { _id: "folder-a", children: [] }] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "a" as Id<"nodes">,
      path: [1, 0],
    });
    expect(result).toEqual([{ _id: "folder-a", children: [{ _id: "a" }] }]);
  });

  it("prevents moving a folder into itself", () => {
    const tree = [
      { _id: "folder-a", children: [{ _id: "child-a" }] },
    ] as NodesTree;
    expect(() => {
      moveNode({
        tree,
        nodeId: "folder-a" as Id<"nodes">,
        path: [0, 0],
      });
    }).toThrow();
  });

  it("prevents moving a folder into one of its direct children", () => {
    const tree = [
      {
        _id: "folder-a",
        children: [
          { _id: "folder-b", children: [{ _id: "child-b" }] },
          { _id: "child-a" },
        ],
      },
    ] as NodesTree;
    expect(() => {
      moveNode({
        tree,
        nodeId: "folder-a" as Id<"nodes">,
        path: [0, 0, 0],
      });
    }).toThrow();
  });

  it("prevents moving a folder into one of its deeply nested descendants", () => {
    const tree = [
      {
        _id: "folder-a",
        children: [
          {
            _id: "folder-b",
            children: [
              {
                _id: "folder-c",
                children: [{ _id: "child-c" }],
              },
            ],
          },
        ],
      },
    ] as unknown as NodesTree;
    expect(() => {
      moveNode({
        tree,
        nodeId: "folder-a" as Id<"nodes">,
        path: [0, 0, 0, 0],
      });
    }).toThrow();
  });

  it("prevents moving a node into a folder that is its descendant", () => {
    const tree = [
      {
        _id: "folder-a",
        children: [
          {
            _id: "folder-b",
            children: [{ _id: "child-b" }],
          },
        ],
      },
    ] as unknown as NodesTree;
    expect(() => {
      moveNode({
        tree,
        nodeId: "folder-a" as Id<"nodes">,
        path: [0, 0, 0],
      });
    }).toThrow();
  });

  it("allows moving a node to a different position at root level", () => {
    const tree = [{ _id: "a" }, { _id: "b" }, { _id: "c" }] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "c" as Id<"nodes">,
      path: [0],
    });
    expect(result).toEqual([{ _id: "c" }, { _id: "a" }, { _id: "b" }]);
  });

  it("moves a folder with children preserving its children", () => {
    const tree = [
      { _id: "folder-a", children: [{ _id: "child-1" }, { _id: "child-2" }] },
      { _id: "folder-b", children: [{ _id: "child-3" }] },
    ] as NodesTree;
    const result = moveNode({
      tree,
      nodeId: "folder-a" as Id<"nodes">,
      path: [1, 1],
    });
    expect(result).toEqual([
      {
        _id: "folder-b",
        children: [
          { _id: "child-3" },
          {
            _id: "folder-a",
            children: [{ _id: "child-1" }, { _id: "child-2" }],
          },
        ],
      },
    ]);
  });
});

describe("listPatches", () => {
  it("returns empty array if trees are the same", () => {
    const oldTree = [{ _id: "a" }] as NodesTree;
    const newTree = [{ _id: "a" }] as NodesTree;
    const patches = listPatches(oldTree, newTree);
    expect(patches).toEqual([]);
  });

  it("returns a patch to move a node to a different position at root level", () => {
    const oldTree = [{ _id: "a" }, { _id: "b" }, { _id: "c" }] as NodesTree;
    const newTree = [{ _id: "c" }, { _id: "a" }, { _id: "b" }] as NodesTree;
    const patches = listPatches(oldTree, newTree);
    expect(patches).toEqual([
      { _id: "c", order: 0 },
      { _id: "a", order: 1 },
      { _id: "b", order: 2 },
    ]);
  });

  it("returns patches only for nodes that changed order", () => {
    const oldTree = [{ _id: "a" }, { _id: "b" }, { _id: "c" }] as NodesTree;
    const newTree = [{ _id: "a" }, { _id: "c" }, { _id: "b" }] as NodesTree;
    const patches = listPatches(oldTree, newTree);
    expect(patches).toEqual([
      { _id: "c", order: 1 },
      { _id: "b", order: 2 },
    ]);
  });

  it("returns patches when a node is moved into a folder", () => {
    const oldTree = [
      { _id: "folder-a", children: [] },
      { _id: "node-a" },
    ] as NodesTree;
    const newTree = [
      {
        _id: "folder-a",
        children: [{ _id: "node-a" }],
      },
    ] as NodesTree;
    const patches = listPatches(oldTree, newTree);
    expect(patches).toEqual([
      { _id: "node-a", parentId: "folder-a", order: 0 },
    ]);
  });

  it("returns patches when a node is moved out of a folder", () => {
    const oldTree = [
      {
        _id: "folder-a",
        children: [{ _id: "node-a" }],
      },
    ] as NodesTree;
    const newTree = [
      { _id: "folder-a", children: [] },
      { _id: "node-a" },
    ] as NodesTree;
    const patches = listPatches(oldTree, newTree);
    // In new tree: folder-a at 0, node-a at 1.
    expect(patches).toEqual([{ _id: "node-a", parentId: null, order: 1 }]);
  });

  it("returns patches when nodes are reordered inside a folder", () => {
    const oldTree = [
      {
        _id: "folder-a",
        children: [{ _id: "a" }, { _id: "b" }],
      },
    ] as NodesTree;
    const newTree = [
      {
        _id: "folder-a",
        children: [{ _id: "b" }, { _id: "a" }],
      },
    ] as NodesTree;
    const patches = listPatches(oldTree, newTree);
    expect(patches).toEqual([
      { _id: "b", order: 0 },
      { _id: "a", order: 1 },
    ]);
  });

  it("handles complex structural changes", () => {
    const oldTree = [
      { _id: "root-1" },
      {
        _id: "folder-a",
        children: [{ _id: "child-a" }],
      },
    ] as NodesTree;

    // Move root-1 into folder-a
    // Move child-a to root
    const newTree = [
      {
        _id: "folder-a",
        children: [{ _id: "root-1" }],
      },
      { _id: "child-a" },
    ] as NodesTree;

    const patches = listPatches(oldTree, newTree);

    // folder-a: order 1 -> 0
    // root-1: root (order 0) -> folder-a (order 0)
    // child-a: folder-a (order 0) -> root (order 1)

    // We expect patches for all of them
    const sortedPatches = patches.sort((a, b) => a._id.localeCompare(b._id));

    expect(sortedPatches).toEqual(
      [
        { _id: "child-a", parentId: null, order: 1 },
        { _id: "folder-a", order: 0 },
        { _id: "root-1", parentId: "folder-a", order: 0 },
      ].sort((a, b) => a._id.localeCompare(b._id)),
    );
  });
});

describe("applyPatches", () => {
  it("applies patches to recreate the new tree structure", () => {
    const oldTree = [
      { _id: "root-1" },
      {
        _id: "folder-a",
        children: [{ _id: "child-a" }],
      },
    ] as NodesTree;

    const newTree = [
      {
        _id: "folder-a",
        children: [{ _id: "root-1" }],
      },
      { _id: "child-a" },
    ] as NodesTree;

    const patches = listPatches(oldTree, newTree);
    const applied = applyPatches(oldTree, patches);
    expect(applied).toEqual(newTree);
  });

  it("handles reordering patches", () => {
    const oldTree = [{ _id: "a" }, { _id: "b" }, { _id: "c" }] as NodesTree;
    const newTree = [{ _id: "c" }, { _id: "a" }, { _id: "b" }] as NodesTree;
    const patches = listPatches(oldTree, newTree);
    const applied = applyPatches(oldTree, patches);
    expect(applied).toEqual(newTree);
  });

  it("handles empty patches", () => {
    const tree = [{ _id: "a" }] as NodesTree;
    const applied = applyPatches(tree, []);
    expect(applied).toEqual(tree);
  });

  it("handles complex structural changes", () => {
    const oldTree = [
      { _id: "folder-a", children: [{ _id: "a-1" }, { _id: "a-2" }] },
      { _id: "folder-b", children: [] },
    ] as NodesTree;

    const newTree = [
      { _id: "folder-a", children: [] },
      { _id: "folder-b", children: [{ _id: "a-2" }, { _id: "a-1" }] },
    ] as NodesTree;

    const patches = listPatches(oldTree, newTree);
    const applied = applyPatches(oldTree, patches);
    expect(applied).toEqual(newTree);
  });
});
