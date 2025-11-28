import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import type { z } from "zod";
import { autorun } from "mobx";
import { useEffect } from "react";
import { useEffectContext } from "../EffectProvider";

export function FadeTo({
  string,
  props = stringEffectDefinitions.fadeTo.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.fadeTo.props>;
}) {
  const model = useEffectContext();

  useEffect(
    () =>
      autorun(() => {
        // Observe effectPlaybackRatio to trigger on each frame update
        void model.effectPlaybackRatio;
        for (let i = 0; i < string.ledCount; i++) {
          const [currentR, currentG, currentB] = string.getPixel(i);

          // Lerp each channel towards the target color
          const r = Math.round(
            currentR + (props.color[0] - currentR) * props.fadeSpeed,
          );
          const g = Math.round(
            currentG + (props.color[1] - currentG) * props.fadeSpeed,
          );
          const b = Math.round(
            currentB + (props.color[2] - currentB) * props.fadeSpeed,
          );

          string.setPixel(i, r, g, b);
        }
      }),
    [string, props.color, props.fadeSpeed],
  );

  return null;
}
