import { useState } from "react";
import { Stack, Text, TextInput, Group, Popover, Select } from "@mantine/core";
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";
import type { SwitchNodeModel } from "../../../shared/models/SwitchNodeModel";

export default function SwitchSettingsSection({
  node,
}: {
  node: SwitchNodeModel;
}) {
  const [iconPickerOpened, setIconPickerOpened] = useState(false);

  const name = node.name ?? "";
  const iconEmoji = node.icon?.kind === "emoji" ? node.icon.emoji : "💡";
  const ipAddress = node.ipAddress ?? "";
  const apiType = node.apiType ?? "athom_type1";

  return (
    <Stack pt="xs" gap="xs">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500} style={{ minWidth: "80px" }}>
          Name
        </Text>
        <TextInput
          value={name}
          placeholder="Enter switch name"
          onChange={(e) => {
            const v = e.currentTarget.value.trim();
            if (v.length === 0) return;
            if (v === node.name) return;
            node.setName(v);
          }}
          data-autofocus
          style={{ flex: 1, maxWidth: "200px" }}
        />
      </Group>

      <Group justify="space-between" align="center">
        <Text size="sm" fw={500} style={{ minWidth: "80px" }}>
          Icon
        </Text>
        <Popover
          opened={iconPickerOpened}
          onChange={setIconPickerOpened}
          position="bottom"
          withArrow
        >
          <Popover.Target>
            <TextInput
              value={iconEmoji}
              placeholder="💡"
              readOnly
              onClick={() => setIconPickerOpened((o) => !o)}
              style={{ flex: 1, maxWidth: "200px", cursor: "pointer" }}
            />
          </Popover.Target>
          <Popover.Dropdown>
            <EmojiPicker
              onEmojiClick={(emojiData: EmojiClickData) => {
                const trimmed = emojiData.emoji.trim();
                if (trimmed.length === 0) return;
                if (node.icon?.kind === "emoji" && trimmed === node.icon.emoji)
                  return;
                node.setIcon({ kind: "emoji", emoji: trimmed });
                setIconPickerOpened(false);
              }}
            />
          </Popover.Dropdown>
        </Popover>
      </Group>

      <Group justify="space-between" align="center">
        <Text size="sm" fw={500} style={{ minWidth: "80px" }}>
          IP address
        </Text>
        <TextInput
          value={ipAddress}
          placeholder="e.g. 192.168.2.58"
          onChange={(e) => {
            const v = e.currentTarget.value.trim();
            if (v === node.ipAddress) return;
            node.setIpAddress(v);
          }}
          style={{ flex: 1, maxWidth: "200px" }}
        />
      </Group>

      <Group justify="space-between" align="center">
        <Text size="sm" fw={500} style={{ minWidth: "80px" }}>
          API Type
        </Text>
        <Select
          value={apiType}
          onChange={(value) => {
            if (value === "athom_type1" || value === "athom_type2")
              node.setApiType(value);
          }}
          data={[
            { value: "athom_type1", label: "Athom Type 1 (Smart Plug v2)" },
            { value: "athom_type2", label: "Athom Type 2 (Switch)" },
          ]}
          style={{ flex: 1, maxWidth: "200px" }}
          allowDeselect={false}
        />
      </Group>
    </Stack>
  );
}
