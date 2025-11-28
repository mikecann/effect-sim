import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ActionIcon, Group, Text, Tooltip } from "@mantine/core";
import { IconFolder, IconFolderOpen, IconCopy } from "@tabler/icons-react";
import type { NodeDoc } from "../../shared/nodeTree";
import { useApp } from "../common/AppContext";
import type { FlattenedItem } from "../common/TreeDataProvider/treeUtilities";

interface NodesTreeRowProps {
  id: string;
  item: FlattenedItem;
  depth: number;
  clone?: boolean;
  onToggle: (itemId: string) => void;
  onSelect: (itemId: string, modifier: "none" | "shift") => void;
}

function getNodeName(data: NodeDoc): string {
  if (data.kind === "string") return data.name;
  if (data.kind === "virtual_string") return data.name;
  if (data.kind === "folder") return data.label;
  if (data.kind === "switch") return data.name;
  return "";
}

export const NodesTreeRow = ({
  id,
  item,
  depth,
  clone = false,
  onToggle,
  onSelect,
}: NodesTreeRowProps) => {
  const appModel = useApp();
  const project = appModel.getProject();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled: clone,
  });

  const nodeData = item.data;
  const nodeId = nodeData._id as NodeDoc["_id"];
  const selectedNodeIds = appModel.selectedNodeIds;
  const isSelected = selectedNodeIds.includes(nodeId);
  const isOnlySelected =
    selectedNodeIds.length === 1 && selectedNodeIds[0] === nodeId;
  const isExpanded = item.collapsed !== true;
  const hasChildren = item.hasChildren;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Group
      ref={setNodeRef}
      {...(clone ? {} : attributes)}
      {...(clone ? {} : listeners)}
      onClick={(e) => {
        if (clone) return;
        e.preventDefault();

        if (!e.shiftKey && isOnlySelected) {
          appModel.setSelectedEntity(null);
          return;
        }

        if (nodeData.kind === "folder" && isSelected) {
          onToggle(id);
          return;
        }

        onSelect(id, e.shiftKey ? "shift" : "none");
      }}
      gap={6}
      pl={6 + depth * 20}
      p={6}
      wrap="nowrap"
      align="center"
      style={{
        ...style,
        flex: 1,
        cursor: clone ? "grabbing" : "grab",
        position: "relative",
        userSelect: "none",
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
      }}
      bg={isSelected ? "var(--mantine-color-dark-9)" : undefined}
    >
      <Group gap={6} wrap="nowrap" align="center" style={{ flex: 1 }}>
        {nodeData.kind === "folder" ? (
          <FolderIcon
            hasChildren={hasChildren}
            isExpanded={isExpanded}
            isSelected={isSelected}
            onClick={(e) => {
              e.stopPropagation();
              if (!isSelected) onSelect(id, "none");
              onToggle(id);
            }}
          />
        ) : (
          <NodeIcon kind={nodeData.kind} icon={nodeData.icon} />
        )}
        <Text
          c={isSelected ? "blue.2" : "bright"}
          style={{ userSelect: "none" }}
        >
          {getNodeName(nodeData)}
        </Text>
      </Group>
      {isOnlySelected && !clone ? (
        <DuplicateButton
          onClick={(e) => {
            e.stopPropagation();
            const newNode = project.duplicateNode(nodeId);
            appModel.setSelectedEntity({ kind: "node", node: newNode });
          }}
        />
      ) : null}
    </Group>
  );
};

// Helper components to clean up render
const FolderIcon = ({
  hasChildren,
  isExpanded,
  isSelected,
  onClick,
}: {
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  onClick: React.MouseEventHandler;
}) => {
  const color = isSelected
    ? "var(--mantine-color-blue-4)"
    : "var(--mantine-color-yellow-9)";

  if (!hasChildren) return <IconFolder size={16} color={color} />;

  const Icon = isExpanded ? IconFolderOpen : IconFolder;
  return (
    <Icon
      size={16}
      color={color}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    />
  );
};

const NodeIcon = ({
  kind,
  icon,
}: {
  kind: string;
  icon?: { kind: string; emoji?: string };
}) => {
  const emoji = icon?.kind === "emoji" ? icon.emoji : null;
  const defaultIcon =
    kind === "switch" ? "💡" : kind === "virtual_string" ? "🔗" : "🎄";
  return (
    <Text style={{ fontSize: 16, lineHeight: 1 }}>{emoji ?? defaultIcon}</Text>
  );
};

const DuplicateButton = ({ onClick }: { onClick: React.MouseEventHandler }) => (
  <Tooltip label="Duplicate" openDelay={400} position="left">
    <ActionIcon
      size="sm"
      variant="subtle"
      aria-label="Duplicate node"
      onClick={onClick}
    >
      <IconCopy size={16} />
    </ActionIcon>
  </Tooltip>
);
