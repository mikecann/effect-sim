import { Group, MultiSelect, Select, Stack, Text } from "@mantine/core";
import { useApp } from "../../../../common/AppContext";
import type { StringNodeModel } from "../../../../../shared/models/StringNodeModel";

type TrackAppliesToSectionProps = {
  appliesToKind: "all_nodes" | "nodes";
  selectedNodeIds: string[];
  onAppliesToKindChange: (kind: "all_nodes" | "nodes") => Promise<void>;
  onNodeIdsChange: (nodeIds: string[]) => Promise<void>;
};

export function TrackAppliesToSection({
  appliesToKind,
  selectedNodeIds,
  onAppliesToKindChange,
  onNodeIdsChange,
}: TrackAppliesToSectionProps) {
  const project = useApp().getProject();
  const stringNodes = project.getNodesByKind("string") as StringNodeModel[];

  const nodeOptions = stringNodes.map((node) => ({
    value: node._id,
    label: node.name || `String ${node._id.slice(-4)}`,
  }));

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500} style={{ minWidth: "80px" }}>
          Applies To
        </Text>
        <Select
          value={appliesToKind}
          onChange={(value) =>
            onAppliesToKindChange(value as "all_nodes" | "nodes")
          }
          data={[
            { value: "all_nodes", label: "All Nodes" },
            { value: "nodes", label: "Specific Nodes" },
          ]}
          style={{ flex: 1, maxWidth: "200px" }}
        />
      </Group>

      {appliesToKind === "nodes" && (
        <Group justify="space-between" align="flex-start">
          <Text
            size="sm"
            fw={500}
            style={{ minWidth: "80px", paddingTop: 6 }}
          >
            Nodes
          </Text>
          <MultiSelect
            value={selectedNodeIds}
            onChange={onNodeIdsChange}
            data={nodeOptions}
            placeholder={
              nodeOptions.length === 0 ? "No nodes available" : "Select nodes"
            }
            searchable
            clearable
            style={{ flex: 1, maxWidth: "200px" }}
            disabled={nodeOptions.length === 0}
            maxDropdownHeight={200}
          />
        </Group>
      )}
    </Stack>
  );
}

