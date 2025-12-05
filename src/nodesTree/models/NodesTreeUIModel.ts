import { makeAutoObservable } from "mobx";
import { AppModel } from "../../common/models/AppModel";
import {
  createNodesTreeFromDocs,
  type NodesTree,
  type NodeDoc,
  isFolder,
  findNodePath,
  getNodeAtPath,
  listPatches,
  moveNode,
  type Patch,
} from "../../../shared/nodeTree";
import type { FlattenedItem } from "../../common/TreeDataProvider/treeUtilities";
import {
  getProjection,
  type Projection,
} from "../../common/TreeDataProvider/treeUtilities";
import type { UniqueIdentifier } from "@dnd-kit/core";
import { Id } from "../../../convex/_generated/dataModel";

const INDENTATION_WIDTH = 20;

export class NodesTreeUIModel {
  expandedItems: string[] = [];
  activeId: UniqueIdentifier | null = null;
  overId: UniqueIdentifier | null = null;
  offsetLeft = 0;

  constructor(public readonly app: AppModel) {
    makeAutoObservable(this, {
      app: false,
    });

    const persistedData = app.persistedData.nodesTrees?.[0];
    this.expandedItems = persistedData?.expandedItems ?? [];
  }

  get project() {
    return this.app.project;
  }

  get tree(): NodesTree | null {
    const project = this.project;
    if (!project) return null;
    return createNodesTreeFromDocs(project.nodes);
  }

  get flattenedItems(): FlattenedItem[] {
    const tree = this.tree;
    if (!tree) return [];
    return this.flattenTree(tree);
  }

  get sortedIds(): string[] {
    return this.flattenedItems.map((item) => item.id);
  }

  get activeItem(): FlattenedItem | null {
    if (!this.activeId) return null;
    return (
      this.flattenedItems.find(({ id }) => id === String(this.activeId)) ?? null
    );
  }

  private get nodesById(): Map<string, NodeDoc> {
    const project = this.app.project;
    if (!project) return new Map();
    const map = new Map<string, NodeDoc>();
    for (const node of project.nodes) map.set(node._id, node.doc);
    return map;
  }

  private flattenTree(
    tree: NodesTree,
    depth = 0,
    parentId: string | null = null,
  ): FlattenedItem[] {
    const result: FlattenedItem[] = [];
    const expandedItems = new Set(this.expandedItems);
    const nodesById = this.nodesById;

    for (const node of tree) {
      const nodeData = nodesById.get(node._id);
      if (!nodeData) continue;

      const hasChildren = isFolder(node) && node.children.length > 0;

      const item: FlattenedItem = {
        id: node._id,
        data: nodeData,
        depth,
        parentId,
        collapsed: isFolder(node) && !expandedItems.has(node._id),
        hasChildren,
      };

      result.push(item);

      if (isFolder(node) && expandedItems.has(node._id)) {
        const children = this.flattenTree(node.children, depth + 1, node._id);
        result.push(...children);
      }
    }

    return result;
  }

  setExpandedItems(items: string[]) {
    this.expandedItems = items;
  }

  toggleExpandedItem(itemId: string) {
    if (this.expandedItems.includes(itemId))
      this.expandedItems = this.expandedItems.filter((id) => id !== itemId);
    else this.expandedItems = [...this.expandedItems, itemId];
  }

  get projected(): Projection | null {
    if (!this.activeId || !this.overId) return null;

    return getProjection(
      this.flattenedItems,
      String(this.activeId),
      String(this.overId),
      this.offsetLeft,
      INDENTATION_WIDTH,
    );
  }

  handleDragStart(id: UniqueIdentifier) {
    this.activeId = id;
    this.overId = id;
    document.body.style.setProperty("cursor", "grabbing");
  }

  handleDragMove(deltaX: number) {
    this.offsetLeft = deltaX;
  }

  handleDragOver(overId: UniqueIdentifier | null) {
    this.overId = overId;
  }

  handleDragCancel() {
    this.overId = null;
    this.activeId = null;
    this.offsetLeft = 0;
    document.body.style.setProperty("cursor", "");
  }

  calculateDropPatches(): Patch[] | null {
    const activeId = this.activeId;
    const overId = this.overId;
    const nodeTree = this.tree;

    if (!overId || !activeId || activeId === overId || !nodeTree) return null;

    const flattenedItems = this.flattenedItems;
    const overIndex = flattenedItems.findIndex(
      ({ id }) => id === String(overId),
    );
    const activeIndex = flattenedItems.findIndex(
      ({ id }) => id === String(activeId),
    );

    if (overIndex === -1 || activeIndex === -1) return null;

    const targetDepth =
      this.projected?.depth ?? flattenedItems[overIndex].depth;
    const targetParentId = this.getParentId(overIndex, targetDepth);
    const targetIndex = this.calculateTargetIndex(
      overIndex,
      activeIndex,
      targetParentId,
    );

    const nodeId = String(activeId) as Id<"nodes">;
    const finalTargetParentId = (targetParentId ?? null) as Id<"nodes"> | null;

    const sourcePath = findNodePath({ tree: nodeTree, nodeId });
    if (sourcePath === null) return null;

    const targetPath: number[] =
      finalTargetParentId === null
        ? [targetIndex]
        : (() => {
            const parentPath = findNodePath({
              tree: nodeTree,
              nodeId: finalTargetParentId,
            });
            if (parentPath === null) return [targetIndex];
            const parentNode = getNodeAtPath(nodeTree, parentPath);
            if (!parentNode || !isFolder(parentNode)) return [targetIndex];
            return [...parentPath, targetIndex];
          })();

    const newTree = moveNode({ tree: nodeTree, nodeId, path: targetPath });
    return listPatches(nodeTree, newTree);
  }

  private getParentId(overIndex: number, activeDepth: number): string | null {
    if (activeDepth === 0) return null;

    const flattenedItems = this.flattenedItems;
    // Look backwards from the over item to find the parent at depth - 1
    for (let i = overIndex; i >= 0; i--) {
      const item = flattenedItems[i];
      // Only folders can be parents
      if (item.depth === activeDepth - 1 && item.data.kind === "folder")
        return item.id;
      // If we've gone up a level, we've gone too far
      if (item.depth < activeDepth - 1) break;
    }

    return null;
  }

  private calculateTargetIndex(
    overIndex: number,
    activeIndex: number,
    targetParentId: string | null,
  ): number {
    const flattenedItems = this.flattenedItems;
    // Calculate target index: count how many siblings with the same parent come before the drop position
    let targetIndex = 0;

    // When dragging down (activeIndex < overIndex), we need to count up to and including overIndex
    // because after removing the active item, everything shifts down by 1
    // When dragging up (activeIndex > overIndex), we count up to (but not including) overIndex
    const endIndex = activeIndex < overIndex ? overIndex + 1 : overIndex;

    // Count siblings before the drop position
    for (let i = 0; i < endIndex; i++) {
      if (i === activeIndex) continue; // Skip the item being dragged

      const item = flattenedItems[i];
      const itemParentId = item.parentId === null ? null : item.parentId;

      // Count items that will be siblings (same parent) at the target location
      if (itemParentId === targetParentId) targetIndex++;
    }

    return targetIndex;
  }
}
