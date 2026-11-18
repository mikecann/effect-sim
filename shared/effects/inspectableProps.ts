import { z } from "zod";

const channel = z.number().min(0).max(255);

export const inspectableProps = {
  color: z.tuple([channel, channel, channel]),
  number: z.number(),
  string: z.string().max(1000),
  boolean: z.boolean(),
  range: z.tuple([z.number(), z.number()]),
  /** A finite number from min to max (the inspector's input keeps to them too). */
  bounded: (min: number, max: number) => z.number().min(min).max(max),
};

export type InspectableKind =
  "color" | "number" | "string" | "boolean" | "range";

/** Which inspector editor a prop's schema needs, or null for one it doesn't know. */
export const inspectableKind = (schema: z.ZodType): InspectableKind | null => {
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodTuple) {
    const items = schema.def.items.length;
    if (items === 3) return "color";
    if (items === 2) return "range";
  }
  return null;
};

/** A bounded number's limits, for the inspector's input. */
export const numberBounds = (schema: z.ZodType) =>
  schema instanceof z.ZodNumber
    ? {
        min: Number.isFinite(schema.minValue)
          ? (schema.minValue ?? undefined)
          : undefined,
        max: Number.isFinite(schema.maxValue)
          ? (schema.maxValue ?? undefined)
          : undefined,
      }
    : { min: undefined, max: undefined };

export type ColorProp = z.infer<typeof inspectableProps.color>;
export type NumberProp = z.infer<typeof inspectableProps.number>;
export type StringProp = z.infer<typeof inspectableProps.string>;
export type BooleanProp = z.infer<typeof inspectableProps.boolean>;
export type RangeProp = z.infer<typeof inspectableProps.range>;
