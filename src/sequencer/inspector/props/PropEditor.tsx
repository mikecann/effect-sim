import { ColorPropEditor } from "./ColorPropEditor";
import { NumberPropEditor } from "./NumberPropEditor";
import { StringPropEditor } from "./StringPropEditor";
import { BooleanPropEditor } from "./BooleanPropEditor";
import { RangePropEditor } from "./RangePropEditor";
import type { z } from "zod";
import {
  inspectableKind,
  numberBounds,
} from "../../../../shared/effects/inspectableProps";

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

  const kind = inspectableKind(propType);

  if (kind === "color")
    return (
      <ColorPropEditor
        label={label}
        value={value as [number, number, number] | undefined}
        onChange={onChange as (value: [number, number, number]) => void}
      />
    );

  if (kind === "number")
    return (
      <NumberPropEditor
        label={label}
        {...numberBounds(propType)}
        value={value as number | undefined}
        onChange={onChange as (value: number) => void}
      />
    );

  if (kind === "string")
    return (
      <StringPropEditor
        label={label}
        value={value as string | undefined}
        onChange={onChange as (value: string) => void}
      />
    );

  if (kind === "boolean")
    return (
      <BooleanPropEditor
        label={label}
        value={value as boolean | undefined}
        onChange={onChange as (value: boolean) => void}
      />
    );

  if (kind === "range")
    return (
      <RangePropEditor
        label={label}
        value={value as [number, number] | undefined}
        onChange={onChange as (value: [number, number]) => void}
      />
    );

  // If we reach here, we have an unknown prop type
  console.error(`Unknown prop type for ${propName}:`, propType);
  return null;
}
