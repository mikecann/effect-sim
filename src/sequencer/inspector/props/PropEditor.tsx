import { ColorPropEditor } from "./ColorPropEditor";
import { NumberPropEditor } from "./NumberPropEditor";
import { StringPropEditor } from "./StringPropEditor";
import { BooleanPropEditor } from "./BooleanPropEditor";
import type { z } from "zod";
import { inspectableProps } from "../../../common/props/inspectableProps";

type PropEditorProps = {
  propName: string;
  propType: z.ZodTypeAny;
  value: unknown;
  onChange: (value: unknown) => void;
};

export function PropEditor({
  propName,
  propType,
  value,
  onChange,
}: PropEditorProps) {
  // Format the prop name to be more readable (camelCase to Title Case)
  const formatLabel = (name: string) => {
    return name
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  const label = formatLabel(propName);

  // Exhaustive switch over all possible inspectable prop types
  if (propType === inspectableProps.color)
    return (
      <ColorPropEditor
        label={label}
        value={value as [number, number, number] | undefined}
        onChange={onChange as (value: [number, number, number]) => void}
      />
    );

  if (propType === inspectableProps.number)
    return (
      <NumberPropEditor
        label={label}
        value={value as number | undefined}
        onChange={onChange as (value: number) => void}
      />
    );

  if (propType === inspectableProps.string)
    return (
      <StringPropEditor
        label={label}
        value={value as string | undefined}
        onChange={onChange as (value: string) => void}
      />
    );

  if (propType === inspectableProps.boolean)
    return (
      <BooleanPropEditor
        label={label}
        value={value as boolean | undefined}
        onChange={onChange as (value: boolean) => void}
      />
    );

  // If we reach here, we have an unknown prop type
  console.error(`Unknown prop type for ${propName}:`, propType);
  return null;
}
