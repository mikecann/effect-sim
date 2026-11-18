import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame } from "../api";
import { inspectableProps } from "../inspectableProps";

export const setColor = defineEffect({
  id: "setColor",
  name: "Set Color",
  icon: "🎨",
  props: z.object({
    color: inspectableProps.color,
  }),
  defaults: { color: [255, 255, 255] },
  render: function SetColor({ string, props }) {
    useEffectFrame(() => {
      string.setAllPixels(props.color[0], props.color[1], props.color[2]);
    });
    return null;
  },
});
