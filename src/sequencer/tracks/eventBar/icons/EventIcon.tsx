import type { AllTrackEventModels } from "../../../../../shared/models/sequencer";
import { IconSparkles, IconPower, IconPalette } from "@tabler/icons-react";
import {
  stringEffectDefinitions,
  stringEffectDefinitionIds,
} from "../../../../common/effects/stringEffectDefinitions";
import { switchEffectDefinitionIds } from "../../../../common/effects/switchEffectDefinitions";
import { SetColorIcon } from "./SetColorIcon";
import { SparkleIcon } from "./SparkleIcon";
import { MultiplyAllIcon } from "./MultiplyAllIcon";
import { TurnOnIcon } from "./TurnOnIcon";
import { TurnOffIcon } from "./TurnOffIcon";
import { ToggleIcon } from "./ToggleIcon";
import { TurnOnThenOffIcon } from "./TurnOnThenOffIcon";

interface EventIconProps {
  event: AllTrackEventModels;
  color?: string;
  size?: number;
}

export function EventIcon({ event, color, size = 14 }: EventIconProps) {
  if (event.kind === "string_effect") {
    // Custom icons for specific string effects
    if (event.effectDefinitionId === stringEffectDefinitionIds.setColor)
      return (
        <SetColorIcon
          color={color}
          size={size}
          props={
            event.props as { color?: [number, number, number] } | undefined
          }
        />
      );

    if (event.effectDefinitionId === stringEffectDefinitionIds.sparkle)
      return (
        <SparkleIcon
          color={color}
          size={size}
          props={
            event.props as
              | { color?: [number, number, number]; sparklesPerFrame?: number }
              | undefined
          }
        />
      );

    if (event.effectDefinitionId === stringEffectDefinitionIds.rainbowRandom)
      return <IconPalette size={size} style={{ color }} />;

    if (event.effectDefinitionId === stringEffectDefinitionIds.multiplyAll)
      return (
        <MultiplyAllIcon
          color={color}
          size={size}
          props={event.props as { multiplier?: number } | undefined}
        />
      );

    // Default icon for string effects
    return <IconSparkles size={size} style={{ color }} />;
  }

  if (event.kind === "switch_effect") {
    // Custom icons for specific switch effects
    if (event.effectDefinitionId === switchEffectDefinitionIds.turnOn)
      return <TurnOnIcon color={color} size={size} />;

    if (event.effectDefinitionId === switchEffectDefinitionIds.turnOff)
      return <TurnOffIcon color={color} size={size} />;

    if (event.effectDefinitionId === switchEffectDefinitionIds.toggle)
      return <ToggleIcon color={color} size={size} />;

    if (event.effectDefinitionId === switchEffectDefinitionIds.turnOnThenOff)
      return <TurnOnThenOffIcon color={color} size={size} />;

    // Default icon for switch effects
    return <IconPower size={size} style={{ color }} />;
  }

  // Fallback default icon
  return <IconSparkles size={size} style={{ color }} />;
}
