import React, { useState } from "react";
import {
  Stack,
  Text,
  TextInput,
  NumberInput,
  Slider,
  Group,
  Button,
  Popover,
} from "@mantine/core";
import { useApp } from "../../common/AppContext";
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";
import type { Id } from "../../../convex/_generated/dataModel";
import type { StringNodeModel } from "../../../shared/models/StringNodeModel";
import { iife } from "../../../shared/misc";

function IconPickerInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom" withArrow>
      <Popover.Target>
        <TextInput
          value={value}
          placeholder="🎄"
          readOnly
          onClick={() => setOpened((o) => !o)}
          style={{ flex: 1, maxWidth: "200px", cursor: "pointer" }}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <EmojiPicker
          onEmojiClick={(emojiData: EmojiClickData) => {
            onChange(emojiData.emoji);
            setOpened(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

function FormFieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Group justify="space-between" align="center">
      <Text size="sm" fw={500} style={{ minWidth: "80px" }}>
        {label}
      </Text>
      {children}
    </Group>
  );
}

export default function StringSettingsSection({
  node,
}: {
  node: StringNodeModel;
}) {
  const appModel = useApp();

  const name = node.name ?? "";
  const iconEmoji = node.icon?.kind === "emoji" ? node.icon.emoji : "🎄";
  const ipAddress = node.ipAddress ?? "";
  const port = node.port ?? 4048;
  const ledCount = node.ledCount ?? 50;
  const brightness = node.brightness ?? 128;

  return (
    <Stack pt="xs" gap="xs">
      <FormFieldGroup label="Name">
        <TextInput
          value={name}
          placeholder="Enter string name"
          onChange={(e) => {
            const v = e.currentTarget.value.trim();
            if (v.length === 0) return;
            if (v === node.name) return;
            node.setName(v);
          }}
          data-autofocus
          style={{ flex: 1, maxWidth: "200px" }}
        />
      </FormFieldGroup>

      <FormFieldGroup label="Icon">
        <IconPickerInput
          value={iconEmoji}
          onChange={(emoji) => {
            const trimmed = emoji.trim();
            if (trimmed.length === 0) return;
            if (node.icon?.kind === "emoji" && trimmed === node.icon.emoji)
              return;
            node.setIcon({ kind: "emoji", emoji: trimmed });
          }}
        />
      </FormFieldGroup>

      <FormFieldGroup label="IP address">
        <TextInput
          value={ipAddress}
          placeholder="e.g. 192.168.1.100"
          onChange={(e) => {
            const v = e.currentTarget.value.trim();
            if (v === node.ipAddress) return;
            node.setIpAddress(v);
          }}
          style={{ flex: 1, maxWidth: "200px" }}
        />
      </FormFieldGroup>

      <FormFieldGroup label="Port">
        <NumberInput
          value={port}
          min={1}
          max={65535}
          stepHoldDelay={500}
          stepHoldInterval={100}
          onChange={(v) => {
            const next = typeof v === "number" ? v : port;
            if (next === node.port) return;
            node.setPort(next);
          }}
          style={{ flex: 1, maxWidth: "200px" }}
        />
      </FormFieldGroup>

      <FormFieldGroup label="LED Count">
        <NumberInput
          value={ledCount}
          min={1}
          max={10000}
          stepHoldDelay={500}
          stepHoldInterval={100}
          onChange={(v) => {
            const next = typeof v === "number" ? v : ledCount;
            if (next === node.ledCount) return;
            node.setLedCount(next);
          }}
          style={{ flex: 1, maxWidth: "200px" }}
        />
      </FormFieldGroup>

      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Brightness
        </Text>
        <Slider
          label={(val) => `${val}`}
          min={0}
          max={255}
          value={brightness}
          onChange={(v) => {
            if (v === node.brightness) return;
            node.setBrightness(v);
          }}
        />
      </Stack>

      {appModel.placingStringId === node._id ? (
        <Button color="red" onClick={() => appModel.cancelPlacingString()}>
          Cancel
        </Button>
      ) : (
        <Button onClick={() => appModel.startPlacingString(node._id)}>
          Place String
        </Button>
      )}
    </Stack>
  );
}
