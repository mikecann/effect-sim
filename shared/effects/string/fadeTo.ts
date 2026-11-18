import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame } from "../api";
import { inspectableProps } from "../inspectableProps";

export const fadeTo = defineEffect({
  id: "fadeTo",
  name: "Fade To",
  icon: "🌅",
  props: z.object({
    color: inspectableProps.color,
    fadeSpeed: inspectableProps.bounded(0, 1),
  }),
  defaults: { color: [0, 0, 0], fadeSpeed: 0.1 },
  render: function FadeTo({ string, props }) {
    useEffectFrame(() => {
      for (let i = 0; i < string.ledCount; i++) {
        const [currentR, currentG, currentB] = string.getPixel(i);

        // Lerp each channel towards the target color
        const r = Math.round(
          currentR + (props.color[0] - currentR) * props.fadeSpeed,
        );
        const g = Math.round(
          currentG + (props.color[1] - currentG) * props.fadeSpeed,
        );
        const b = Math.round(
          currentB + (props.color[2] - currentB) * props.fadeSpeed,
        );

        string.setPixel(i, r, g, b);
      }
    });
    return null;
  },
});
