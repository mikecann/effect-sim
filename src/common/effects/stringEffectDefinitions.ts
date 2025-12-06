import { produceLiteral } from "../../../shared/misc";
import { RainbowRandom } from "./string/RainbowRandom";
import { AnyZodObject, z } from "zod";
import { inspectableProps } from "../props/inspectableProps";
import { Sparkle } from "./string/Sparkle";
import { SetColor } from "./string/SetColor";
import { MultiplyAll } from "./string/MultiplyAll";
import { Comet } from "./string/Comet";
import { BouncingComet } from "./string/BouncingComet";
import { Pulse } from "./string/Pulse";
import { Twinkle } from "./string/Twinkle";
import { Fireflies } from "./string/Fireflies";
import { FadeTo } from "./string/FadeTo";
import { RainbowWave } from "./string/RainbowWave";
import { Aurora } from "./string/Aurora";
import { Fire } from "./string/Fire";
import type { StringLedDataApi } from "../../data/StringLedDataModel";

export type EffectComponent = React.ComponentType<{
  string: StringLedDataApi;
}>;

export interface StringEffectDefinition {
  id: string;
  name: string;
  icon: string;
  component: EffectComponent;
  props?: AnyZodObject;
  defaultProps?: z.infer<(typeof effectProps)[keyof typeof effectProps]>;
}

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
]);

const effectProps = {
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
} satisfies Record<keyof typeof stringEffectDefinitionIds, AnyZodObject>;

export const stringEffectDefinitions = {
  rainbowRandom: {
    id: stringEffectDefinitionIds.rainbowRandom,
    name: "Rainbow Random",
    icon: "🌈",
    component: RainbowRandom,
    props: effectProps.rainbowRandom,
    defaultProps: {
      delayMs: 0,
    },
  },
  rainbowWave: {
    id: stringEffectDefinitionIds.rainbowWave,
    name: "Rainbow Wave",
    icon: "🌊",
    component: RainbowWave,
    props: effectProps.rainbowWave,
    defaultProps: {
      speed: 1,
      wavelength: 1,
    },
  },
  sparkle: {
    id: stringEffectDefinitionIds.sparkle,
    name: "Sparkle",
    icon: "✨",
    component: Sparkle,
    props: effectProps.sparkle,
    defaultProps: {
      color: [255, 255, 255],
      sparklesPerFrame: 1,
    },
  },
  setColor: {
    id: stringEffectDefinitionIds.setColor,
    name: "Set Color",
    icon: "🎨",
    component: SetColor,
    props: effectProps.setColor,
    defaultProps: {
      color: [255, 255, 255],
    },
  },
  multiplyAll: {
    id: stringEffectDefinitionIds.multiplyAll,
    name: "Multiply All",
    icon: "🔅",
    component: MultiplyAll,
    props: effectProps.multiplyAll,
    defaultProps: {
      multiplier: 0.9,
    },
  },
  comet: {
    id: stringEffectDefinitionIds.comet,
    name: "Comet",
    icon: "☄️",
    component: Comet,
    props: effectProps.comet,
    defaultProps: {
      color: [255, 255, 255],
      size: 1,
      fadeRatio: 0.9,
    },
  },
  bouncingComet: {
    id: stringEffectDefinitionIds.bouncingComet,
    name: "Bouncing Comet",
    icon: "🏀",
    component: BouncingComet,
    props: effectProps.bouncingComet,
    defaultProps: {
      color: [255, 255, 255],
      size: 1,
      fadeRatio: 0.9,
      numBounces: 1,
    },
  },
  pulse: {
    id: stringEffectDefinitionIds.pulse,
    name: "Pulse",
    icon: "💓",
    component: Pulse,
    props: effectProps.pulse,
    defaultProps: {
      fromColor: [0, 0, 0],
      toColor: [255, 255, 255],
      speed: 1,
    },
  },
  twinkle: {
    id: stringEffectDefinitionIds.twinkle,
    name: "Twinkle",
    icon: "⭐",
    component: Twinkle,
    props: effectProps.twinkle,
    defaultProps: {
      fromColor: [0, 0, 0],
      toColor: [255, 230, 180],
      speed: 0.5,
      ratioOfLedsToApplyTo: 1,
    },
  },
  fireflies: {
    id: stringEffectDefinitionIds.fireflies,
    name: "Fireflies",
    icon: "🪲",
    component: Fireflies,
    props: effectProps.fireflies,
    defaultProps: {
      color: [255, 230, 100],
      numFireflies: 3,
      speed: 0.3,
      fadeRatio: 0.9,
      minTravelDistance: 0.2,
      maxTravelDistance: 0.5,
    },
  },
  fadeTo: {
    id: stringEffectDefinitionIds.fadeTo,
    name: "Fade To",
    icon: "🌅",
    component: FadeTo,
    props: effectProps.fadeTo,
    defaultProps: {
      color: [0, 0, 0],
      fadeSpeed: 0.1,
    },
  },
  aurora: {
    id: stringEffectDefinitionIds.aurora,
    name: "Aurora Borealis",
    icon: "🌌",
    component: Aurora,
    props: effectProps.aurora,
    defaultProps: {
      speed: 0.5,
      intensity: 1,
      colorSpread: 2,
    },
  },
  fire: {
    id: stringEffectDefinitionIds.fire,
    name: "Fire",
    icon: "🔥",
    component: Fire,
    props: effectProps.fire,
    defaultProps: {
      cooling: 0.02,
      sparking: 0.3,
      intensity: 1,
    },
  },
} satisfies Record<
  keyof typeof stringEffectDefinitionIds,
  StringEffectDefinition
>;

export const stringEffectDefinitionsArray = Object.values(
  stringEffectDefinitions,
);

export const stringEffectDefinitionsMap = new Map<
  string,
  StringEffectDefinition
>(stringEffectDefinitionsArray.map((def) => [def.id, def]));
