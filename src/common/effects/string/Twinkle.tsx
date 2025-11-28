import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import { seededRandom } from "../../../../shared/random";
import type { z } from "zod";
import { autorun } from "mobx";
import { useEffect } from "react";
import { useEffectContext } from "../EffectProvider";

const simpleHash = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
};

export function Twinkle({
  string,
  props = stringEffectDefinitions.twinkle.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.twinkle.props>;
}) {
  const model = useEffectContext();

  useEffect(
    () =>
      autorun(() => {
        const adjustedRatio = (model.effectPlaybackRatio * props.speed) % 1;
        const baseHash = simpleHash(string._id);

        for (let i = 0; i < string.ledCount; i++) {
          const seed = baseHash + i;
          const shouldApply =
            seededRandom(seed, 0) < props.ratioOfLedsToApplyTo;

          if (!shouldApply) continue;

          const offset = seededRandom(seed, 1);
          const ledRatio = (adjustedRatio + offset) % 1;
          const twinkleRatio = Math.sin(ledRatio * Math.PI * 2) * 0.5 + 0.5;

          const r = Math.round(
            props.fromColor[0] +
              (props.toColor[0] - props.fromColor[0]) * twinkleRatio,
          );
          const g = Math.round(
            props.fromColor[1] +
              (props.toColor[1] - props.fromColor[1]) * twinkleRatio,
          );
          const b = Math.round(
            props.fromColor[2] +
              (props.toColor[2] - props.fromColor[2]) * twinkleRatio,
          );

          string.setPixel(i, r, g, b);
        }
      }),
    [],
  );

  return null;
}
