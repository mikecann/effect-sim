import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame } from "../api";
import { inspectableProps } from "../inspectableProps";

export const multiplyAll = defineEffect({
  id: "multiplyAll",
  name: "Multiply All",
  icon: "🔅",
  props: z.object({
    multiplier: inspectableProps.bounded(0, 10),
  }),
  defaults: { multiplier: 0.9 },
  render: function MultiplyAll({ string, props }) {
    useEffectFrame(() => {
      string.multiplyAll(props.multiplier);
    });
    return null;
  },
});
