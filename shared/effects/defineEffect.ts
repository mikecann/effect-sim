import { createElement, useMemo, type FunctionComponent } from "react";
import type { z } from "zod";
import type { EffectString } from "./api";
import type { SwitchNodeModel } from "../models/SwitchNodeModel";

// One file per effect: `defineEffect({ id, name, icon, props, defaults,
// render })` in shared/effects/string (or defineSwitchEffect in
// shared/effects/switch), plus its line in shared/effects/registry.ts. The
// render gets its props typed from the schema, already checked and filled
// in from the defaults.

type Shape = Record<string, z.ZodType>;
type PropsOf<S extends Shape> = z.infer<z.ZodObject<S>>;

/** What the runtime hands an effect: the event's props as saved, unchecked. */
export type StringEffectRunProps = { string: EffectString; rawProps: unknown };
export type SwitchEffectRunProps = {
  switch: SwitchNodeModel;
  rawProps: unknown;
};

/** What every effect has, whatever its props. */
type EffectBase<Id extends string, S extends Shape> = {
  id: Id;
  name: string;
  /** The props an event can set, with their bounds. */
  props: z.ZodObject<S>;
  /** What each prop is when an event doesn't set it. */
  defaults: PropsOf<S>;
  /** The props an event saved, checked field by field, with defaults for the rest. */
  resolveProps(raw: unknown): PropsOf<S>;
};

export type StringEffect<
  Id extends string = string,
  S extends Shape = Shape,
> = EffectBase<Id, S> & {
  kind: "string_effect";
  icon: string;
  /** Runs the effect with an event's saved props. */
  Run: FunctionComponent<StringEffectRunProps>;
};

export type SwitchEffect<
  Id extends string = string,
  S extends Shape = Shape,
> = EffectBase<Id, S> & {
  kind: "switch_effect";
  Run: FunctionComponent<SwitchEffectRunProps>;
};

type StringEffectSpec<Id extends string, S extends Shape> = {
  id: Id;
  name: string;
  icon: string;
  props: z.ZodObject<S>;
  defaults: PropsOf<S>;
  /** A React component that lights the string. */
  render: FunctionComponent<{ string: EffectString; props: PropsOf<S> }>;
};

type SwitchEffectSpec<Id extends string, S extends Shape> = {
  id: Id;
  name: string;
  props: z.ZodObject<S>;
  defaults: PropsOf<S>;
  /** A React component that drives the switch. */
  render: FunctionComponent<{ switch: SwitchNodeModel; props: PropsOf<S> }>;
};

/**
 * Each field the event set that fits the schema, and the default for the
 * rest. A field of the wrong type falls back to its default rather than
 * breaking the effect (old events can hold another effect's props).
 */
const resolver = <S extends Shape>(
  schema: z.ZodObject<S>,
  defaults: PropsOf<S>,
) => {
  const partial = schema.partial();
  return (raw: unknown): PropsOf<S> => {
    if (typeof raw !== "object" || raw === null) return defaults;
    const fields: Record<string, unknown> = { ...defaults };
    for (const [key, value] of Object.entries(raw))
      if (
        Object.prototype.hasOwnProperty.call(schema.shape, key) &&
        partial.safeParse({ [key]: value }).success
      )
        fields[key] = value;
    const parsed = schema.safeParse(fields);
    return parsed.success ? parsed.data : defaults;
  };
};

export const defineEffect = <const Id extends string, S extends Shape>(
  spec: StringEffectSpec<Id, S>,
): StringEffect<Id, S> & StringEffectSpec<Id, S> => {
  const resolveProps = resolver(spec.props, spec.defaults);
  const Render = spec.render;
  function Run({ string, rawProps }: StringEffectRunProps) {
    const props = useMemo(() => resolveProps(rawProps), [rawProps]);
    return createElement(Render, { string, props });
  }
  return { ...spec, kind: "string_effect", resolveProps, Run };
};

export const defineSwitchEffect = <const Id extends string, S extends Shape>(
  spec: SwitchEffectSpec<Id, S>,
): SwitchEffect<Id, S> & SwitchEffectSpec<Id, S> => {
  const resolveProps = resolver(spec.props, spec.defaults);
  const Render = spec.render;
  function Run({ switch: node, rawProps }: SwitchEffectRunProps) {
    const props = useMemo(() => resolveProps(rawProps), [rawProps]);
    return createElement(Render, { switch: node, props });
  }
  return { ...spec, kind: "switch_effect", resolveProps, Run };
};
