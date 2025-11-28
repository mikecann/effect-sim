import { Stack, Text, TextInput, Group } from "@mantine/core";
import type { FolderNodeModel } from "../../../shared/models/FolderNodeModel";

export default function FolderSettingsSection({
  node,
}: {
  node: FolderNodeModel;
}) {
  const label = node.label ?? "";

  return (
    <Stack pt="xs" gap="xs">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500} style={{ minWidth: "80px" }}>
          Label
        </Text>
        <TextInput
          value={label}
          placeholder="Enter folder name"
          onChange={(e) => {
            const v = e.currentTarget.value.trim();
            if (v.length === 0) return;
            if (v === node.label) return;
            node.setLabel(v);
          }}
          data-autofocus
          style={{ flex: 1, maxWidth: "200px" }}
        />
      </Group>
    </Stack>
  );
}
