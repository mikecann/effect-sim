import { Button, Group, RangeSlider, Select, Stack, Text } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { useApp } from "../../common/AppContext";
import type { VirtualStringNodeSegmentModel } from "../../../shared/models/VirtualStringNodeSegmentModel";

export function VirtualStringSegmentItem({
  segmentModel,
}: {
  segmentModel: VirtualStringNodeSegmentModel;
}) {
  const appModel = useApp();

  const isSelected = segmentModel.isSelected(appModel);

  return (
    <Stack
      gap="xs"
      p="sm"
      style={{
        backgroundColor: "var(--mantine-color-dark-6)",
        borderRadius: 4,
        cursor: "pointer",
        border: isSelected ? "2px solid var(--mantine-color-yellow-5)" : "none",
      }}
      onClick={() => {
        if (isSelected) segmentModel.setSelected(appModel, null);
        else segmentModel.setSelected(appModel, segmentModel.segmentIndex);
      }}
    >
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500}>
          Segment {segmentModel.segmentIndex + 1}
        </Text>
        <Button
          size="xs"
          variant="subtle"
          color="red"
          onClick={(e) => {
            e.stopPropagation();
            segmentModel.remove();
          }}
        >
          <IconTrash size={14} />
        </Button>
      </Group>

      <Stack
        gap="xs"
        onClick={(e) => {
          e.stopPropagation();
          if (!isSelected)
            segmentModel.setSelected(appModel, segmentModel.segmentIndex);
        }}
      >
        <Group justify="space-between" align="center">
          <Text size="sm" fw={500} style={{ minWidth: "80px" }}>
            String
          </Text>
          <Select
            placeholder="Select a string"
            data={segmentModel.stringOptions}
            value={segmentModel.nodeId}
            onChange={(value) => {
              if (!value) return;
              segmentModel.updateNodeId(value as Id<"nodes">);
            }}
            onDropdownClose={() => {
              segmentModel.setSelected(appModel, segmentModel.segmentIndex);
            }}
            renderOption={(item) => <div>{item.option.label}</div>}
            style={{ flex: 1, maxWidth: "200px" }}
          />
        </Group>

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Index Range
          </Text>
          <RangeSlider
            value={[segmentModel.fromIndex, segmentModel.toIndex]}
            min={0}
            max={segmentModel.maxIndex ?? 0}
            onClick={() => {
              segmentModel.setSelected(appModel, segmentModel.segmentIndex);
            }}
            onChange={(value) => {
              segmentModel.setSelected(appModel, segmentModel.segmentIndex);
              const [fromIndex, toIndex] = value;
              segmentModel.updateRange(fromIndex, toIndex);
            }}
          />
        </Stack>
      </Stack>
    </Stack>
  );
}
