import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import type { z } from "zod";
import { autorun } from "mobx";
import { useEffect } from "react";
import { useEffectContext } from "../EffectProvider";

export function MultiplyAll({
  string,
  props = stringEffectDefinitions.multiplyAll.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.multiplyAll.props>;
}) {
  const model = useEffectContext();

  useEffect(
    () =>
      autorun(() => {
        // Observe effectPlaybackRatio to trigger on each frame update
        void model.effectPlaybackRatio;
        string.multiplyAll(props.multiplier);
      }),
    [string, props.multiplier],
  );

  return null; // This is a headless component that just runs the effect
}
