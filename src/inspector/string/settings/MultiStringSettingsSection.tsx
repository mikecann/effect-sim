import { useMemo, useState } from "react";
import { Stack, Text, Group, Slider, Tooltip } from "@mantine/core";
import type { StringNodeModel } from "../../../../shared/models/StringNodeModel";

interface MultiStringSettingsSectionProps {
  nodes: Array<StringNodeModel>;
}

export function MultiStringSettingsSection({
  nodes,
}: MultiStringSettingsSectionProps) {
  const brightnessValues = useMemo(
    () => nodes.map((node) => node.brightness),
    [nodes],
  );
  const [localBrightness, setLocalBrightness] = useState<number | null>(null);

  const effectiveBrightness =
    localBrightness === null ? brightnessValues[0] : localBrightness;

  const hasMixedBrightness =
    brightnessValues.some((value) => value !== brightnessValues[0]) &&
    localBrightness === null;

  const slider = (
    <Slider
      label={(val) => `${val}`}
      min={0}
      max={255}
      value={effectiveBrightness}
      onChange={(value) => {
        setLocalBrightness(value);
      }}
      onChangeEnd={(value) => {
        nodes.forEach((node) => node.setBrightness(value));
        setLocalBrightness(null);
      }}
    />
  );

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500}>
          Brightness
        </Text>
        {hasMixedBrightness ? (
          <Tooltip label="Multiple values" openDelay={400}>
            <Text size="xs" c="yellow.5">
              Mixed
            </Text>
          </Tooltip>
        ) : null}
      </Group>
      {slider}
      {hasMixedBrightness ? (
        <Text size="xs" c="dimmed">
          Values differ across selected strings. Adjusting updates all strings.
        </Text>
      ) : null}
    </Stack>
  );
}
