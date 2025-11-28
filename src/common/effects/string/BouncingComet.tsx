import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import type { z } from "zod";
import { autorun } from "mobx";
import { useEffect } from "react";
import { useEffectContext } from "../EffectProvider";

export function BouncingComet({
  string,
  props = stringEffectDefinitions.bouncingComet.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.bouncingComet.props>;
}) {
  const model = useEffectContext();

  useEffect(
    () =>
      autorun(() => {
        if (props.fadeRatio !== 1) string.multiplyAll(props.fadeRatio);

        const totalSegments = Math.max(1, Math.floor(props.numBounces)) + 1;
        const segmentProgress = model.effectPlaybackRatio * totalSegments;
        const currentSegment = Math.floor(segmentProgress);
        const segmentRatio = segmentProgress - currentSegment;

        const isReversed = currentSegment % 2 === 1;
        const adjustedRatio = isReversed ? 1 - segmentRatio : segmentRatio;

        const size = Math.max(1, Math.floor(Math.abs(props.size)));
        const centerIndex = Math.floor(adjustedRatio * string.ledCount);
        const clampedCenter = Math.min(centerIndex, string.ledCount - 1);
        const halfSize = Math.floor((size - 1) / 2);
        const startIndex = Math.max(0, clampedCenter - halfSize);
        const endIndex = Math.min(string.ledCount - 1, startIndex + size - 1);

        for (let i = startIndex; i <= endIndex; i++)
          string.setPixel(i, props.color[0], props.color[1], props.color[2]);
      }),
    [string, props.color, props.size, props.fadeRatio, props.numBounces],
  );

  return null;
}
