import { produceLiteral } from "../../../shared/misc";
import { TurnOn } from "./switch/TurnOn";
import { TurnOff } from "./switch/TurnOff";
import { Toggle } from "./switch/Toggle";
import { TurnOnThenOff } from "./switch/TurnOnThenOff";
import { AnyZodObject, z } from "zod";
import { inspectableProps } from "../props/inspectableProps";
import type { SwitchNodeModel } from "../../../shared/models/SwitchNodeModel";

export type SwitchEffectComponent = React.ComponentType<{
  switch: SwitchNodeModel;
  props?: Record<string, unknown>;
}>;

export interface SwitchEffectDefinition {
  id: string;
  name: string;
  component: SwitchEffectComponent;
  props?: AnyZodObject;
  defaultProps?: z.infer<(typeof effectProps)[keyof typeof effectProps]>;
}

export const switchEffectDefinitionIds = produceLiteral([
  "turnOn",
  "turnOff",
  "toggle",
  "turnOnThenOff",
]);

const effectProps = {
  turnOn: z.object({}),
  turnOff: z.object({}),
  toggle: z.object({}),
  turnOnThenOff: z.object({}),
} satisfies Record<keyof typeof switchEffectDefinitionIds, AnyZodObject>;

export const switchEffectDefinitions = {
  turnOn: {
    id: switchEffectDefinitionIds.turnOn,
    name: "Turn On",
    component: TurnOn,
    props: effectProps.turnOn,
    defaultProps: {},
  },
  turnOff: {
    id: switchEffectDefinitionIds.turnOff,
    name: "Turn Off",
    component: TurnOff,
    props: effectProps.turnOff,
    defaultProps: {},
  },
  toggle: {
    id: switchEffectDefinitionIds.toggle,
    name: "Toggle",
    component: Toggle,
    props: effectProps.toggle,
    defaultProps: {},
  },
  turnOnThenOff: {
    id: switchEffectDefinitionIds.turnOnThenOff,
    name: "Turn On Then Off",
    component: TurnOnThenOff,
    props: effectProps.turnOnThenOff,
    defaultProps: {},
  },
} satisfies Record<
  keyof typeof switchEffectDefinitionIds,
  SwitchEffectDefinition
>;

export const switchEffectDefinitionsArray = Object.values(
  switchEffectDefinitions,
);

export const switchEffectDefinitionsMap = new Map<
  string,
  SwitchEffectDefinition
>(switchEffectDefinitionsArray.map((def) => [def.id, def]));
