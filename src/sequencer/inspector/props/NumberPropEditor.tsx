import { NumberInput } from "@mantine/core";
import type { NumberProp } from "../../../../shared/effects/inspectableProps";
import { useAdaptiveStep } from "../../../common/hooks/useAdaptiveStep";

type NumberPropEditorProps = {
  label: string;
  value: NumberProp | undefined;
  onChange: (value: NumberProp) => void;
  min?: number;
  max?: number;
};

export function NumberPropEditor({
  label,
  value,
  onChange,
  min,
  max,
}: NumberPropEditorProps) {
  const step = useAdaptiveStep(value);
  return (
    <NumberInput
      label={label}
      value={value ?? 0}
      onChange={(val) => onChange(Number(val))}
      step={step}
      min={min}
      max={max}
      clampBehavior="strict"
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
