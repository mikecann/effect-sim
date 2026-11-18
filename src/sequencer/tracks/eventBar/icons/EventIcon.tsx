import type { AllTrackEventModels } from "../../../../../shared/models/sequencer";
import { IconSparkles, IconPower, IconPalette } from "@tabler/icons-react";
import { setColor } from "../../../../../shared/effects/string/setColor";
import { sparkle } from "../../../../../shared/effects/string/sparkle";
import { multiplyAll } from "../../../../../shared/effects/string/multiplyAll";
import { SetColorIcon } from "./SetColorIcon";
import { SparkleIcon } from "./SparkleIcon";
import { MultiplyAllIcon } from "./MultiplyAllIcon";
import { TurnOnIcon } from "./TurnOnIcon";
import { TurnOffIcon } from "./TurnOffIcon";
import { ToggleIcon } from "./ToggleIcon";
import { TurnOnThenOffIcon } from "./TurnOnThenOffIcon";
import { TurnOffThenOnIcon } from "./TurnOffThenOnIcon";

interface EventIconProps {
  event: AllTrackEventModels;
  color?: string;
  size?: number;
}

export function EventIcon({ event, color, size = 14 }: EventIconProps) {
  if (event.kind === "string_effect") {
    // Custom icons for specific string effects
    if (event.effectDefinitionId === setColor.id)
      return (
        <SetColorIcon
          color={color}
          size={size}
          props={setColor.resolveProps(event.props)}
        />
      );

    if (event.effectDefinitionId === sparkle.id)
      return (
        <SparkleIcon
          color={color}
          size={size}
          props={sparkle.resolveProps(event.props)}
        />
      );

    if (event.effectDefinitionId === "rainbowRandom")
      return <IconPalette size={size} style={{ color }} />;

    if (event.effectDefinitionId === multiplyAll.id)
      return (
        <MultiplyAllIcon
          color={color}
          size={size}
          props={multiplyAll.resolveProps(event.props)}
        />
      );

    // Default icon for string effects
    return <IconSparkles size={size} style={{ color }} />;
  }

  if (event.kind === "switch_effect") {
    // Custom icons for specific switch effects
    if (event.effectDefinitionId === "turnOn")
      return <TurnOnIcon color={color} size={size} />;

    if (event.effectDefinitionId === "turnOff")
      return <TurnOffIcon color={color} size={size} />;

    if (event.effectDefinitionId === "toggle")
      return <ToggleIcon color={color} size={size} />;

    if (event.effectDefinitionId === "turnOnThenOff")
      return <TurnOnThenOffIcon color={color} size={size} />;

    if (event.effectDefinitionId === "turnOffThenOn")
      return <TurnOffThenOnIcon color={color} size={size} />;

    // Default icon for switch effects
    return <IconPower size={size} style={{ color }} />;
  }

  // Fallback default icon
  return <IconSparkles size={size} style={{ color }} />;
}
