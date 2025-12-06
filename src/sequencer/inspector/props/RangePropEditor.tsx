import { RangeSlider, Stack, Text } from "@mantine/core";
import type { RangeProp } from "../../../common/props/inspectableProps";

type RangePropEditorProps = {
  label: string;
  value: RangeProp | undefined;
  onChange: (value: RangeProp) => void;
};

export function RangePropEditor({
  label,
  value,
  onChange,
}: RangePropEditorProps) {
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <RangeSlider
        value={value ?? [0, 100]}
        onChange={(val) => onChange([val[0], val[1]])}
        min={0}
        max={100}
        step={1}
        styles={{
          track: {
            backgroundColor: "var(--mantine-color-dark-5)",
          },
          bar: {
            backgroundColor: "var(--mantine-color-blue-6)",
          },
          thumb: {
            backgroundColor: "var(--mantine-color-blue-6)",
            borderColor: "var(--mantine-color-dark-4)",
          },
        }}
      />
    </Stack>
  );
}

