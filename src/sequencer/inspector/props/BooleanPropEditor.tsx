import { Checkbox } from "@mantine/core";
import type { BooleanProp } from "../../../common/props/inspectableProps";

type BooleanPropEditorProps = {
  label: string;
  value: BooleanProp | undefined;
  onChange: (value: BooleanProp) => void;
};

export function BooleanPropEditor({
  label,
  value,
  onChange,
}: BooleanPropEditorProps) {
  return (
    <Checkbox
      label={label}
      checked={value ?? false}
      onChange={(e) => onChange(e.currentTarget.checked)}
      size="sm"
      styles={{
        input: {
          backgroundColor: "var(--mantine-color-dark-5)",
          borderColor: "var(--mantine-color-dark-4)",
        },
        label: {
          fontSize: 14,
        },
      }}
    />
  );
}
