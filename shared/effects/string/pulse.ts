import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame, useEffectTiming } from "../api";
import { inspectableProps } from "../inspectableProps";

export const pulse = defineEffect({
  id: "pulse",
  name: "Pulse",
  icon: "💓",
  props: z.object({
    fromColor: inspectableProps.color,
    toColor: inspectableProps.color,
    speed: inspectableProps.bounded(-100, 100),
  }),
  defaults: { fromColor: [0, 0, 0], toColor: [255, 255, 255], speed: 1 },
  render: function Pulse({ string, props }) {
    const timing = useEffectTiming();
    useEffectFrame(() => {
      const adjustedRatio = (timing.effectPlaybackRatio * props.speed) % 1;
      const pulseRatio = Math.sin(adjustedRatio * Math.PI * 2) * 0.5 + 0.5;

      const r = Math.round(
        props.fromColor[0] +
          (props.toColor[0] - props.fromColor[0]) * pulseRatio,
      );
      const g = Math.round(
        props.fromColor[1] +
          (props.toColor[1] - props.fromColor[1]) * pulseRatio,
      );
      const b = Math.round(
        props.fromColor[2] +
          (props.toColor[2] - props.fromColor[2]) * pulseRatio,
      );

      string.setAllPixels(r, g, b);
    });
    return null;
  },
});
