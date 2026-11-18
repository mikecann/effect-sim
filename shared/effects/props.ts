import { z } from "zod";
import { produceLiteral } from "../misc";
import { inspectableProps } from "./inspectableProps";

// Every effect's id and the zod schema of its props. Every number has bounds
// that keep an effect's loops and allocations small (a runaway count would
// freeze HWIR on the live display); production's values all fit them. Shared by the editor and
// HWIR (src/common/effects/*Definitions.ts, which add the components) and by
// Convex, which checks each event's props in editor.sync.

export const stringEffectDefinitionIds = produceLiteral([
  "rainbowRandom",
  "rainbowWave",
  "sparkle",
  "setColor",
  "multiplyAll",
  "comet",
  "bouncingComet",
  "pulse",
  "twinkle",
  "fireflies",
  "fadeTo",
  "aurora",
  "fire",
  "fireworks",
  "cycleSine",
  "lightning",
  "plasma",
  "bouncingBalls",
]);

export const stringEffectProps = {
  rainbowRandom: z.object({
    delayMs: inspectableProps.bounded(0, 60_000),
  }),
  rainbowWave: z.object({
    speed: inspectableProps.bounded(-100, 100),
    wavelength: inspectableProps.bounded(0, 100),
  }),
  sparkle: z.object({
    color: inspectableProps.color,
    sparklesPerFrame: inspectableProps.bounded(0, 1000),
  }),
  setColor: z.object({
    color: inspectableProps.color,
  }),
  multiplyAll: z.object({
    multiplier: inspectableProps.bounded(0, 10),
  }),
  comet: z.object({
    color: inspectableProps.color,
    size: inspectableProps.bounded(0, 1000),
    fadeRatio: inspectableProps.bounded(0, 1),
  }),
  bouncingComet: z.object({
    color: inspectableProps.color,
    size: inspectableProps.bounded(0, 1000),
    fadeRatio: inspectableProps.bounded(0, 1),
    numBounces: inspectableProps.bounded(0, 100),
  }),
  pulse: z.object({
    fromColor: inspectableProps.color,
    toColor: inspectableProps.color,
    speed: inspectableProps.bounded(-100, 100),
  }),
  twinkle: z.object({
    fromColor: inspectableProps.color,
    toColor: inspectableProps.color,
    speed: inspectableProps.bounded(-100, 100),
    ratioOfLedsToApplyTo: inspectableProps.bounded(0, 1),
  }),
  fireflies: z.object({
    color: inspectableProps.color,
    numFireflies: inspectableProps.bounded(0, 500),
    speed: inspectableProps.bounded(-100, 100),
    fadeRatio: inspectableProps.bounded(0, 1),
    minTravelDistance: inspectableProps.bounded(0, 1),
    maxTravelDistance: inspectableProps.bounded(0, 1),
  }),
  fadeTo: z.object({
    color: inspectableProps.color,
    fadeSpeed: inspectableProps.bounded(0, 1),
  }),
  aurora: z.object({
    speed: inspectableProps.bounded(-100, 100),
    intensity: inspectableProps.bounded(0, 10),
    colorSpread: inspectableProps.bounded(0, 100),
  }),
  fire: z.object({
    cooling: inspectableProps.bounded(0, 1),
    sparking: inspectableProps.bounded(0, 1),
    intensity: inspectableProps.bounded(0, 10),
  }),
  fireworks: z.object({
    frequency: inspectableProps.bounded(0, 100),
    speed: inspectableProps.bounded(-100, 100),
    size: inspectableProps.bounded(0, 1000),
    intensity: inspectableProps.bounded(0, 10),
  }),
  cycleSine: z.object({
    color1: inspectableProps.color,
    color2: inspectableProps.color,
    color3: inspectableProps.color,
    speed: inspectableProps.bounded(-100, 100),
    spread: inspectableProps.bounded(0, 100),
    waveSpeed: inspectableProps.bounded(-100, 100),
    wavelength: inspectableProps.bounded(0, 100),
    waveAmplitude: inspectableProps.bounded(0, 10),
  }),
  lightning: z.object({
    strikeChance: inspectableProps.bounded(0, 1),
    intensity: inspectableProps.bounded(0, 10),
    fadeSpeed: inspectableProps.bounded(0, 1),
    minSpread: inspectableProps.bounded(0, 1000),
    maxSpread: inspectableProps.bounded(0, 1000),
  }),
  plasma: z.object({
    color: inspectableProps.color,
    speed: inspectableProps.bounded(-100, 100),
    scale: inspectableProps.bounded(0, 100),
    complexity: inspectableProps.bounded(0, 10),
    intensity: inspectableProps.bounded(0, 10),
  }),
  bouncingBalls: z.object({
    numBalls: inspectableProps.bounded(0, 100),
    speed: inspectableProps.bounded(-100, 100),
    size: inspectableProps.bounded(0, 1000),
    intensity: inspectableProps.bounded(0, 10),
  }),
} satisfies Record<
  keyof typeof stringEffectDefinitionIds,
  z.ZodObject<z.ZodRawShape>
>;

export const switchEffectDefinitionIds = produceLiteral([
  "turnOn",
  "turnOff",
  "toggle",
  "turnOnThenOff",
  "turnOffThenOn",
]);

export const switchEffectProps = {
  turnOn: z.object({}),
  turnOff: z.object({}),
  toggle: z.object({}),
  turnOnThenOff: z.object({}),
  turnOffThenOn: z.object({}),
} satisfies Record<
  keyof typeof switchEffectDefinitionIds,
  z.ZodObject<z.ZodRawShape>
>;

/**
 * Whether a value is plain JSON: finite numbers, strings, booleans, null, and
 * arrays and plain objects of those, not too deep. Convex's v.any() would
 * also take a BigInt or bytes, which props must never hold.
 */
export const isPlainJson = (value: unknown, depth = 0): boolean => {
  if (depth > 8) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 10_000;
  if (Array.isArray(value))
    return (
      value.length <= 10_000 && value.every((v) => isPlainJson(v, depth + 1))
    );
  if (typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(value as Record<string, unknown>).every((v) =>
    isPlainJson(v, depth + 1),
  );
};

export type EffectPropsResult =
  | { ok: true; props: Record<string, unknown> | undefined }
  | { ok: false; problem: string };

/**
 * An event's props checked against its effect, as they should be stored:
 * only the fields the effect takes (fields another effect left behind when
 * the event's effect was changed are dropped), each of the right type and in
 * bounds. Missing fields are fine: the effect's defaults fill them in.
 */
export const parseEffectProps = (
  kind: "string_effect" | "switch_effect",
  effectDefinitionId: string,
  props: unknown,
): EffectPropsResult => {
  const schemas: Record<string, z.ZodObject<z.ZodRawShape>> = kind ===
  "string_effect"
    ? stringEffectProps
    : switchEffectProps;
  // An own property only: "toString" isn't an effect.
  const schema = Object.prototype.hasOwnProperty.call(
    schemas,
    effectDefinitionId,
  )
    ? schemas[effectDefinitionId]
    : undefined;
  if (!schema)
    return {
      ok: false,
      problem: `There's no ${kind.replace("_", " ")} called '${effectDefinitionId}'.`,
    };
  if (props === undefined || props === null)
    return { ok: true, props: undefined };
  if (!isPlainJson(props))
    return {
      ok: false,
      problem: `${effectDefinitionId}'s props aren't plain JSON.`,
    };
  const result = schema.partial().safeParse(props);
  if (result.success) return { ok: true, props: result.data };
  const issue = result.error.issues[0];
  return {
    ok: false,
    problem: `${effectDefinitionId}'s ${issue?.path.join(".") || "props"}: ${issue?.message ?? "invalid"}`,
  };
};

/** Why an event's props won't do for its effect (parseEffectProps), or null. */
export const findEffectPropsProblem = (
  kind: "string_effect" | "switch_effect",
  effectDefinitionId: string,
  props: unknown,
): string | null => {
  const result = parseEffectProps(kind, effectDefinitionId, props);
  return result.ok ? null : result.problem;
};
