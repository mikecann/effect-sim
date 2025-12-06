import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { seededRandomIntRange } from "../../../../shared/random";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import type { z } from "zod";
import { autorun } from "mobx";
import { useEffect } from "react";
import { useEffectContext } from "../EffectProvider";

export function Sparkle({
  string,
  props = stringEffectDefinitions.sparkle.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.sparkle.props>;
}) {
  const model = useEffectContext();

  useEffect(
    () =>
      autorun(() => {
        for (let i = 0; i < props.sparklesPerFrame; i++) {
          const seed = model.effectFrame * props.sparklesPerFrame + i;
          const pixelIndex = seededRandomIntRange(seed, 0, string.ledCount - 1);
          string.setPixel(
            pixelIndex,
            props.color[0],
            props.color[1],
            props.color[2],
          );
        }
      }),
    [string, props.sparklesPerFrame, props.color],
  );

  return null;
}
