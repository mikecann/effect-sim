import { TextInput } from "@mantine/core";
import type { StringProp } from "../../../common/props/inspectableProps";

type StringPropEditorProps = {
  label: string;
  value: StringProp | undefined;
  onChange: (value: StringProp) => void;
};

export function StringPropEditor({
  label,
  value,
  onChange,
}: StringPropEditorProps) {
  return (
    <TextInput
      label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.currentTarget.value)}
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
