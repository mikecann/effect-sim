import { z } from "zod";

export const inspectableProps = {
  color: z.tuple([z.number(), z.number(), z.number()]),
  number: z.number(),
  string: z.string(),
  boolean: z.boolean(),
  range: z.tuple([z.number(), z.number()]),
};

export type ColorProp = z.infer<typeof inspectableProps.color>;
export type NumberProp = z.infer<typeof inspectableProps.number>;
export type StringProp = z.infer<typeof inspectableProps.string>;
export type BooleanProp = z.infer<typeof inspectableProps.boolean>;
export type RangeProp = z.infer<typeof inspectableProps.range>;
