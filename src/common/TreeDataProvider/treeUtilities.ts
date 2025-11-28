import type { NodeDoc } from "../../../shared/nodeTree";

export type FlattenedItem = {
  id: string;
  data: NodeDoc;
  depth: number;
  collapsed?: boolean;
  parentId: string | null;
  hasChildren: boolean;
};

export type Projection = {
  depth: number;
  maxDepth: number;
  minDepth: number;
};

export function getProjection(
  items: FlattenedItem[],
  activeId: string,
  overId: string,
  offsetLeft: number,
  indentationWidth: number,
): Projection {
  const overIndex = items.findIndex(({ id }) => id === overId);
  const activeIndex = items.findIndex(({ id }) => id === activeId);

  if (overIndex === -1 || activeIndex === -1) {
    const fallbackItem = items.find(({ id }) => id === overId);
    return {
      depth: fallbackItem?.depth ?? 0,
      maxDepth: 0,
      minDepth: 0,
    };
  }

  const overItem = items[overIndex];
  const activeItem = items[activeIndex];

  const dragDepth = Math.round(offsetLeft / indentationWidth);
  const projectedDepth = overItem.depth + dragDepth;

  const isDraggingDown = activeIndex < overIndex;
  const previousItem = isDraggingDown ? items[overIndex] : items[overIndex - 1];
  const maxDepth = getMaxDepth({ previousItem });
  const minDepth = getProjectedMinDepth(activeItem, overItem);

  let depth = projectedDepth;
  if (projectedDepth >= maxDepth) depth = maxDepth;
  else if (projectedDepth < minDepth) depth = minDepth;

  return { depth, maxDepth, minDepth };
}

function getMaxDepth({
  previousItem,
}: {
  previousItem?: FlattenedItem;
}): number {
  if (previousItem)
    return previousItem.data.kind === "folder"
      ? previousItem.depth + 1
      : previousItem.depth;
  return 0;
}

function getProjectedMinDepth(
  activeItem: FlattenedItem,
  overItem: FlattenedItem,
): number {
  return overItem.depth;
}
