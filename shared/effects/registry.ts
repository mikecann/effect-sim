import type { StringEffect, SwitchEffect } from "./defineEffect";
import { aurora } from "./string/aurora";
import { bouncingBalls } from "./string/bouncingBalls";
import { bouncingComet } from "./string/bouncingComet";
import { comet } from "./string/comet";
import { cycleSine } from "./string/cycleSine";
import { fadeTo } from "./string/fadeTo";
import { fire } from "./string/fire";
import { fireflies } from "./string/fireflies";
import { fireworks } from "./string/fireworks";
import { lightning } from "./string/lightning";
import { multiplyAll } from "./string/multiplyAll";
import { plasma } from "./string/plasma";
import { pulse } from "./string/pulse";
import { radialPulse } from "./string/radialPulse";
import { rainbowRandom } from "./string/rainbowRandom";
import { rainbowWave } from "./string/rainbowWave";
import { setColor } from "./string/setColor";
import { sparkle } from "./string/sparkle";
import { twinkle } from "./string/twinkle";
import { wipe } from "./string/wipe";
import { toggle } from "./switch/toggle";
import { turnOff } from "./switch/turnOff";
import { turnOffThenOn } from "./switch/turnOffThenOn";
import { turnOn } from "./switch/turnOn";
import { turnOnThenOff } from "./switch/turnOnThenOff";

// Every effect, one line each. Their ids are what events store, so an id
// never changes once an effect has been used.

export const stringEffects = [
  rainbowRandom,
  rainbowWave,
  sparkle,
  setColor,
  multiplyAll,
  comet,
  bouncingComet,
  pulse,
  twinkle,
  fireflies,
  fadeTo,
  aurora,
  fire,
  fireworks,
  cycleSine,
  lightning,
  plasma,
  bouncingBalls,
  wipe,
  radialPulse,
] as const satisfies ReadonlyArray<StringEffect>;

export const switchEffects = [
  turnOn,
  turnOff,
  toggle,
  turnOnThenOff,
  turnOffThenOn,
] as const satisfies ReadonlyArray<SwitchEffect>;

export type StringEffectId = (typeof stringEffects)[number]["id"];
export type SwitchEffectId = (typeof switchEffects)[number]["id"];

const byId = <E extends { id: string }>(effects: ReadonlyArray<E>) => {
  const map = new Map<string, E>(effects.map((e) => [e.id, e]));
  // A Map, so an inherited name like "toString" finds nothing.
  return (id: string): E | null => map.get(id) ?? null;
};

/** The string effect with this id, or null. */
export const findStringEffect = byId<StringEffect>(stringEffects);

/** The switch effect with this id, or null. */
export const findSwitchEffect = byId<SwitchEffect>(switchEffects);
