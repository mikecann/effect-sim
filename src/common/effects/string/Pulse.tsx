import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import type { z } from "zod";
import { autorun } from "mobx";
import { useEffect } from "react";
import { useEffectContext } from "../EffectProvider";

export function Pulse({
  string,
  props = stringEffectDefinitions.pulse.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.pulse.props>;
}) {
  const model = useEffectContext();

  useEffect(
    () =>
      autorun(() => {
        const adjustedRatio = (model.effectPlaybackRatio * props.speed) % 1;
        const pulseRatio = Math.sin(adjustedRatio * Math.PI * 2) * 0.5 + 0.5;

        const r = Math.round(
          props.fromColor[0] +
            (props.toColor[0] - props.fromColor[0]) * pulseRatio,
        );
        const g = Math.round(
          props.fromColor[1] +
            (props.toColor[1] - props.fromColor[1]) * pulseRatio,
        );
        const b = Math.round(
          props.fromColor[2] +
            (props.toColor[2] - props.fromColor[2]) * pulseRatio,
        );

        string.setAllPixels(r, g, b);
      }),
    [string, props.fromColor, props.toColor, props.speed],
  );

  return null;
}
