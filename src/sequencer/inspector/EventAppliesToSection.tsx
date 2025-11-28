import { Group, MultiSelect, Stack, Text } from "@mantine/core";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AllTrackEventModels } from "../../../shared/models/sequencer";
import { useMemo, useEffect } from "react";
import type { NodeDoc } from "../../../shared/nodeTree";
import { exhaustiveCheck } from "../../../shared/misc";

type EventAppliesToSectionProps = {
  event: AllTrackEventModels;
};

function getNodesForEventKind(
  event: AllTrackEventModels,
  stringNodes: NodeDoc[] | undefined,
  virtualStringNodes: NodeDoc[] | undefined,
  switchNodes: NodeDoc[] | undefined,
): NodeDoc[] {
  if (event.data.kind === "string_effect")
    return [...(stringNodes ?? []), ...(virtualStringNodes ?? [])];
  if (event.data.kind === "switch_effect") return switchNodes ?? [];
  exhaustiveCheck(event.data as never);
}

function getNodeOptions(nodes: NodeDoc[] | undefined) {
  if (!nodes) return [];
  return nodes
    .map((node) => {
      if (
        node.kind === "string" ||
        node.kind === "virtual_string" ||
        node.kind === "switch"
      ) {
        const emoji =
          node.icon?.kind === "emoji"
            ? node.icon.emoji
            : node.kind === "string"
              ? "🎄"
              : node.kind === "virtual_string"
                ? "🔗"
                : "💡";
        return {
          value: node._id,
          label:
            node.name ||
            `${node.kind === "string" ? "String" : node.kind === "virtual_string" ? "Virtual String" : "Switch"} ${node._id.slice(-4)}`,
          emoji,
        };
      }
      return null;
    })
    .filter(Boolean) as { value: string; label: string; emoji: string }[];
}

export function EventAppliesToSection({ event }: EventAppliesToSectionProps) {
  const sequence = event.track.sequence;
  const project = sequence.project;
  if (!project)
    throw new Error(
      `Sequence '${sequence._id}' does not have a project associated`,
    );

  // Get all relevant nodes based on event kind
  const stringNodes =
    event.kind === "string_effect" ? project.getNodesByKind("string") : [];
  const virtualStringNodes =
    event.kind === "string_effect"
      ? project.getNodesByKind("virtual_string")
      : [];
  const switchNodes =
    event.kind === "switch_effect" ? project.getNodesByKind("switch") : [];

  // Combine all relevant nodes based on event kind
  const nodes = getNodesForEventKind(
    event,
    stringNodes,
    virtualStringNodes,
    switchNodes,
  );

  const nodeOptions = useMemo(() => getNodeOptions(nodes), [nodes]);

  const validNodeIds = useMemo(
    () => new Set(nodeOptions.map((opt) => opt.value)),
    [nodeOptions],
  );

  const rawSelectedNodeIds = useMemo(
    () => (event.appliesTo.kind === "nodes" ? event.appliesTo.nodeIds : []),
    [event.appliesTo],
  );

  // Filter selected nodes to only include valid ones for the current node kind
  const selectedNodeIds = useMemo(
    () => rawSelectedNodeIds.filter((id: string) => validNodeIds.has(id)),
    [rawSelectedNodeIds, validNodeIds],
  );

  // Ensure appliesTo is always set to "nodes" kind
  useEffect(() => {
    if (event.appliesTo.kind !== "nodes")
      try {
        event.setAppliesTo({
          kind: "nodes" as const,
          nodeIds: [],
        });
      } catch (error) {
        console.error("Failed to update event appliesTo:", error);
      }
  }, [event]);

  // Clean up invalid nodes when node kind changes
  const selectedNodeIdsKey = useMemo(
    () => [...selectedNodeIds].sort().join(","),
    [selectedNodeIds],
  );
  const rawSelectedNodeIdsKey = useMemo(
    () => [...rawSelectedNodeIds].sort().join(","),
    [rawSelectedNodeIds],
  );

  useEffect(() => {
    if (
      event.appliesTo.kind === "nodes" &&
      selectedNodeIdsKey !== rawSelectedNodeIdsKey &&
      validNodeIds.size > 0
    )
      try {
        event.setAppliesTo({
          kind: "nodes" as const,
          nodeIds: selectedNodeIds as Id<"nodes">[],
        });
      } catch (error) {
        console.error("Failed to clean up invalid nodes:", error);
      }
  }, [
    event,
    selectedNodeIdsKey,
    rawSelectedNodeIdsKey,
    validNodeIds.size,
    selectedNodeIds,
  ]);

  return (
    <Stack gap="xs">
      <Stack gap="xs">
        <Text size="sm" fw={500} style={{ minWidth: "80px", paddingTop: 6 }}>
          Nodes
        </Text>
        <MultiSelect
          value={selectedNodeIds}
          onChange={(nodeIds) => {
            try {
              event.setAppliesTo({
                kind: "nodes" as const,
                nodeIds: nodeIds as Id<"nodes">[],
              });
            } catch (error) {
              console.error("Failed to update event nodes:", error);
            }
          }}
          data={nodeOptions.map((opt) => ({
            ...opt,
            label: `${opt.emoji} ${opt.label}`,
          }))}
          placeholder={
            nodeOptions.length === 0 ? "No nodes available" : "Select nodes"
          }
          searchable
          clearable
          hidePickedOptions
          style={{ flex: 1 }}
          disabled={nodeOptions.length === 0}
          maxDropdownHeight={200}
          size="sm"
          renderOption={({ option }) => {
            const originalOption = nodeOptions.find(
              (opt) => opt.value === option.value,
            );
            const emoji = originalOption?.emoji ?? "❓";
            const label = originalOption?.label ?? option.label;
            return (
              <Group gap={6} wrap="nowrap">
                <Text style={{ fontSize: 16, lineHeight: 1 }}>{emoji}</Text>
                <Text>{label}</Text>
              </Group>
            );
          }}
          styles={{
            input: {
              backgroundColor: "var(--mantine-color-dark-5)",
              borderColor: "var(--mantine-color-dark-4)",
            },
          }}
        />
      </Stack>
    </Stack>
  );
}
