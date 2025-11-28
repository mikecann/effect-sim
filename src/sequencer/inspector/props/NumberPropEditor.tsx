import { NumberInput } from "@mantine/core";
import type { NumberProp } from "../../../common/props/inspectableProps";

type NumberPropEditorProps = {
  label: string;
  value: NumberProp | undefined;
  onChange: (value: NumberProp) => void;
};

export function NumberPropEditor({
  label,
  value,
  onChange,
}: NumberPropEditorProps) {
  return (
    <NumberInput
      label={label}
      value={value ?? 0}
      onChange={(val) => onChange(Number(val))}
      size="sm"
      styles={{
        input: {
          backgroundColor: "var(--mantine-color-dark-5)",
          borderColor: "var(--mantine-color-dark-4)",
        },
      }}
    />
  );
}
