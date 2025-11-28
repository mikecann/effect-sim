import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  MeasuringStrategy,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Id } from "../../convex/_generated/dataModel";
import { NodesTreeRow } from "./NodesTreeRow";
import { useNodesTree } from "./NodesTreeContext";

const measuring = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
};

// Move static config outside component
const sensorOptions = {
  activationConstraint: {
    distance: 8,
  },
};

export const NodesTree = () => {
  const model = useNodesTree();
  const nodes = model.project?.nodes ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, sensorOptions),
    useSensor(KeyboardSensor),
  );

  if (!model.project || !model.tree) return null;

  if (nodes.length === 0)
    return (
      <div className="tree">
        <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
          No nodes yet
        </div>
      </div>
    );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={measuring}
      onDragStart={({ active }) => {
        model.handleDragStart(active.id);
      }}
      onDragMove={({ delta }) => {
        model.handleDragMove(delta.x);
      }}
      onDragOver={({ over }) => {
        model.handleDragOver(over?.id ?? null);
      }}
      onDragEnd={() => {
        const patches = model.calculateDropPatches();
        model.handleDragCancel();
        if (!model.project) return;
        if (!patches) return;
        model.project.applyNodePatches(patches);
      }}
      onDragCancel={() => {
        model.handleDragCancel();
      }}
    >
      <div className="tree">
        <SortableContext
          items={model.sortedIds}
          strategy={verticalListSortingStrategy}
        >
          {model.flattenedItems.map((item) => (
            <NodesTreeRow
              key={item.id}
              id={item.id}
              item={item}
              depth={
                item.id === model.activeId && model.projected
                  ? model.projected.depth
                  : item.depth
              }
              onToggle={(itemId) => {
                model.toggleExpandedItem(itemId);
              }}
              onSelect={(itemId, modifier) => {
                const nodeId = itemId as Id<"nodes">;
                const node = nodes.find((n) => n._id === nodeId);
                if (!node) return;

                if (modifier !== "shift") {
                  // Check if this is a virtual_string node
                  if (node.kind === "virtual_string")
                    model.app.setSelectedEntity({
                      kind: "virtual_string",
                      node,
                      selectedSegmentIndex: null,
                    });
                  else
                    model.app.setSelectedEntity({
                      kind: "node",
                      node,
                    });

                  return;
                }

                const selectedNodes = model.app.seletedNodes;
                if (selectedNodes.includes(node))
                  model.app.setSelectedEntity({
                    kind: "nodes",
                    nodes: selectedNodes.filter((n) => n._id !== nodeId),
                  });
                else
                  model.app.setSelectedEntity({
                    kind: "nodes",
                    nodes: [...selectedNodes, node],
                  });
              }}
            />
          ))}
        </SortableContext>
      </div>
      <DragOverlay>
        {model.activeId && model.activeItem ? (
          <NodesTreeRow
            id={String(model.activeId)}
            item={model.activeItem}
            depth={model.activeItem.depth}
            clone
            onToggle={() => {}}
            onSelect={() => {}}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
