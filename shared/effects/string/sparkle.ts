import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame } from "../api";
import { inspectableProps } from "../inspectableProps";

export const sparkle = defineEffect({
  id: "sparkle",
  name: "Sparkle",
  icon: "✨",
  props: z.object({
    color: inspectableProps.color,
    sparklesPerFrame: inspectableProps.bounded(0, 1000),
  }),
  defaults: { color: [255, 255, 255], sparklesPerFrame: 1 },
  render: function Sparkle({ string, props }) {
    useEffectFrame((_frame, random) => {
      for (let i = 0; i < props.sparklesPerFrame; i++)
        string.setPixel(
          random.int(0, string.ledCount - 1),
          props.color[0],
          props.color[1],
          props.color[2],
        );
    });
    return null;
  },
});
