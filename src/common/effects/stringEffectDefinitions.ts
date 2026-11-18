import { RainbowRandom } from "./string/RainbowRandom";
import { z } from "zod";
import {
  stringEffectDefinitionIds,
  stringEffectProps as effectProps,
} from "../../../shared/effects/props";

export { stringEffectDefinitionIds };
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
import { Fireworks } from "./string/Fireworks";
import { CycleSine } from "./string/CycleSine";
import { Lightning } from "./string/Lightning";
import { Plasma } from "./string/Plasma";
import { BouncingBalls } from "./string/BouncingBalls";
import type { StringLedDataApi } from "../../data/StringLedDataModel";

export type EffectComponent = React.ComponentType<{
  string: StringLedDataApi;
}>;

export interface StringEffectDefinition {
  id: string;
  name: string;
  icon: string;
  component: EffectComponent;
  props?: z.ZodObject<z.ZodRawShape>;
  defaultProps?: z.infer<(typeof effectProps)[keyof typeof effectProps]>;
}

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
  fireworks: {
    id: stringEffectDefinitionIds.fireworks,
    name: "Fireworks",
    icon: "🎆",
    component: Fireworks,
    props: effectProps.fireworks,
    defaultProps: {
      frequency: 1,
      speed: 1,
      size: 1,
      intensity: 1,
    },
  },
  cycleSine: {
    id: stringEffectDefinitionIds.cycleSine,
    name: "Cycle Sine",
    icon: "🌊",
    component: CycleSine,
    props: effectProps.cycleSine,
    defaultProps: {
      color1: [255, 0, 0],
      color2: [0, 255, 0],
      color3: [0, 0, 255],
      speed: 1,
      spread: 3,
      waveSpeed: 1,
      wavelength: 2,
      waveAmplitude: 0.2,
    },
  },
  lightning: {
    id: stringEffectDefinitionIds.lightning,
    name: "Lightning",
    icon: "⚡",
    component: Lightning,
    props: effectProps.lightning,
    defaultProps: {
      strikeChance: 0.05,
      intensity: 1,
      fadeSpeed: 0.7,
      minSpread: 3,
      maxSpread: 8,
    },
  },
  plasma: {
    id: stringEffectDefinitionIds.plasma,
    name: "Plasma",
    icon: "🔮",
    component: Plasma,
    props: effectProps.plasma,
    defaultProps: {
      color: [0, 100, 255],
      speed: 1,
      scale: 1,
      complexity: 1,
      intensity: 1,
    },
  },
  bouncingBalls: {
    id: stringEffectDefinitionIds.bouncingBalls,
    name: "Bouncing Balls",
    icon: "🎾",
    component: BouncingBalls,
    props: effectProps.bouncingBalls,
    defaultProps: {
      numBalls: 3,
      speed: 1,
      size: 3,
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
