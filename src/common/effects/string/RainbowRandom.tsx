import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { seededRandomIntRange } from "../../../../shared/random";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import type { z } from "zod";
import { autorun } from "mobx";
import { useEffect } from "react";
import { useEffectContext } from "../EffectProvider";

export function RainbowRandom({
  string,
  props = stringEffectDefinitions.rainbowRandom.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.rainbowRandom.props>;
}) {
  const model = useEffectContext();

  useEffect(
    () =>
      autorun(() => {
        const framesPerUpdate = Math.max(1, Math.floor(props.delayMs / 16));
        if (model.effectFrame % framesPerUpdate !== 0) return;
        for (let i = 0; i < string.ledCount; i++) {
          const seed = model.effectFrame * string.ledCount + i;
          string.setPixel(
            i,
            seededRandomIntRange(seed, 0, 255),
            seededRandomIntRange(seed + 1, 0, 255),
            seededRandomIntRange(seed + 2, 0, 255),
          );
        }
      }),
    [string, props.delayMs],
  );

  return null;
}
