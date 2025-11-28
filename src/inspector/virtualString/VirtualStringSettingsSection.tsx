import { Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useApp } from "../../common/AppContext";
import { VirtualStringSegmentItem } from "./VirtualStringSegmentItem";
import type { VirtualStringNodeModel } from "../../../shared/models/VirtualStringNodeModel";

export default function VirtualStringSettingsSection({
  node,
}: {
  node: VirtualStringNodeModel;
}) {
  const appModel = useApp();
  const project = appModel.getProject();

  const allStrings = project.stringDocs;
  const segmentModels = node.segments;

  return (
    <Stack gap="md" p="md">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500} style={{ minWidth: "80px" }}>
          Name
        </Text>
        <TextInput
          value={node.name}
          placeholder="Enter name"
          onChange={(e) => {
            const v = e.currentTarget.value;
            node.setName(v);
          }}
          style={{ flex: 1, maxWidth: "200px" }}
        />
      </Group>

      <Stack gap="sm">
        <Text size="sm" fw={500}>
          Segments
        </Text>

        {segmentModels.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="md">
            No segments yet
          </Text>
        ) : null}

        {segmentModels.map((segmentModel) => (
          <VirtualStringSegmentItem
            key={segmentModel.segmentIndex}
            segmentModel={segmentModel}
          />
        ))}

        <Button
          size="lg"
          variant="light"
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            if (!allStrings || allStrings.length === 0) return;
            const firstString = allStrings[0];
            if (!firstString) return;
            const newSegments = [
              ...node.doc.segments,
              {
                nodeId: firstString._id,
                fromIndex: 0,
                toIndex: 10,
              },
            ];
            node.setSegments(newSegments);
          }}
        >
          Add Segment
        </Button>
      </Stack>
    </Stack>
  );
}
