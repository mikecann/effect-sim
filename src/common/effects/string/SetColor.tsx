import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import type { z } from "zod";
import { autorun } from "mobx";
import { useEffect } from "react";
import { useEffectContext } from "../EffectProvider";

export function SetColor({
  string,
  props = stringEffectDefinitions.setColor.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.setColor.props>;
}) {
  const model = useEffectContext();

  useEffect(
    () =>
      autorun(() => {
        // Observe effectPlaybackRatio to trigger on each frame update
        void model.effectPlaybackRatio;
        string.setAllPixels(props.color[0], props.color[1], props.color[2]);
      }),
    [string, props.color],
  );

  return null;
}
