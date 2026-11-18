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
 * Why an event's props won't do for its effect, or null when they're fine.
 * Props may leave fields out (the effect's defaults fill them in) and may
 * carry fields another effect left behind when the event's effect was
 * changed; a field the effect takes must have the right type.
 */
export const findEffectPropsProblem = (
  kind: "string_effect" | "switch_effect",
  effectDefinitionId: string,
  props: unknown,
): string | null => {
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
    return `There's no ${kind.replace("_", " ")} called '${effectDefinitionId}'.`;
  if (props === undefined || props === null) return null;
  const result = schema.partial().safeParse(props);
  if (result.success) return null;
  const issue = result.error.issues[0];
  return `${effectDefinitionId}'s ${issue?.path.join(".") || "props"}: ${issue?.message ?? "invalid"}`;
};
