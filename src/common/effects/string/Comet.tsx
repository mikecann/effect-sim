import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import type { z } from "zod";
import { autorun } from "mobx";
import { useEffect } from "react";
import { useEffectContext } from "../EffectProvider";

export function Comet({
  string,
  props = stringEffectDefinitions.comet.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.comet.props>;
}) {
  const model = useEffectContext();

  useEffect(
    () =>
      autorun(() => {
        if (props.fadeRatio !== 1) string.multiplyAll(props.fadeRatio);

        const size = Math.max(1, Math.floor(Math.abs(props.size)));
        const centerIndex = Math.floor(
          model.effectPlaybackRatio * string.ledCount,
        );
        const clampedCenter = Math.min(centerIndex, string.ledCount - 1);
        const halfSize = Math.floor((size - 1) / 2);
        const startIndex = Math.max(0, clampedCenter - halfSize);
        const endIndex = Math.min(string.ledCount - 1, startIndex + size - 1);

        for (let i = startIndex; i <= endIndex; i++)
          string.setPixel(i, props.color[0], props.color[1], props.color[2]);
      }),
    [string, props.color, props.size, props.fadeRatio],
  );

  return null;
}
