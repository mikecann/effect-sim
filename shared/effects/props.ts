import { z } from "zod";
import { produceLiteral } from "../misc";
import { inspectableProps } from "./inspectableProps";

// Every effect's id and the zod schema of its props. Shared by the editor and
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
    delayMs: inspectableProps.number,
  }),
  rainbowWave: z.object({
    speed: inspectableProps.number,
    wavelength: inspectableProps.number,
  }),
  sparkle: z.object({
    color: inspectableProps.color,
    sparklesPerFrame: inspectableProps.number,
  }),
  setColor: z.object({
    color: inspectableProps.color,
  }),
  multiplyAll: z.object({
    multiplier: inspectableProps.number,
  }),
  comet: z.object({
    color: inspectableProps.color,
    size: inspectableProps.number,
    fadeRatio: inspectableProps.number,
  }),
  bouncingComet: z.object({
    color: inspectableProps.color,
    size: inspectableProps.number,
    fadeRatio: inspectableProps.number,
    numBounces: inspectableProps.number,
  }),
  pulse: z.object({
    fromColor: inspectableProps.color,
    toColor: inspectableProps.color,
    speed: inspectableProps.number,
  }),
  twinkle: z.object({
    fromColor: inspectableProps.color,
    toColor: inspectableProps.color,
    speed: inspectableProps.number,
    ratioOfLedsToApplyTo: inspectableProps.number,
  }),
  fireflies: z.object({
    color: inspectableProps.color,
    numFireflies: inspectableProps.number,
    speed: inspectableProps.number,
    fadeRatio: inspectableProps.number,
    minTravelDistance: inspectableProps.number,
    maxTravelDistance: inspectableProps.number,
  }),
  fadeTo: z.object({
    color: inspectableProps.color,
    fadeSpeed: inspectableProps.number,
  }),
  aurora: z.object({
    speed: inspectableProps.number,
    intensity: inspectableProps.number,
    colorSpread: inspectableProps.number,
  }),
  fire: z.object({
    cooling: inspectableProps.number,
    sparking: inspectableProps.number,
    intensity: inspectableProps.number,
  }),
  fireworks: z.object({
    frequency: inspectableProps.number,
    speed: inspectableProps.number,
    size: inspectableProps.number,
    intensity: inspectableProps.number,
  }),
  cycleSine: z.object({
    color1: inspectableProps.color,
    color2: inspectableProps.color,
    color3: inspectableProps.color,
    speed: inspectableProps.number,
    spread: inspectableProps.number,
    waveSpeed: inspectableProps.number,
    wavelength: inspectableProps.number,
    waveAmplitude: inspectableProps.number,
  }),
  lightning: z.object({
    strikeChance: inspectableProps.number,
    intensity: inspectableProps.number,
    fadeSpeed: inspectableProps.number,
    minSpread: inspectableProps.number,
    maxSpread: inspectableProps.number,
  }),
  plasma: z.object({
    color: inspectableProps.color,
    speed: inspectableProps.number,
    scale: inspectableProps.number,
    complexity: inspectableProps.number,
    intensity: inspectableProps.number,
  }),
  bouncingBalls: z.object({
    numBalls: inspectableProps.number,
    speed: inspectableProps.number,
    size: inspectableProps.number,
    intensity: inspectableProps.number,
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
  const schema = schemas[effectDefinitionId];
  if (!schema)
    return `There's no ${kind.replace("_", " ")} called '${effectDefinitionId}'.`;
  if (props === undefined || props === null) return null;
  const result = schema.partial().safeParse(props);
  if (result.success) return null;
  const issue = result.error.issues[0];
  return `${effectDefinitionId}'s ${issue?.path.join(".") || "props"}: ${issue?.message ?? "invalid"}`;
};
