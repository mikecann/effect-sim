import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame, useEffectTiming } from "../api";
import { inspectableProps } from "../inspectableProps";

// A band of colour sweeping across the whole house, by where each LED really
// is, so every string lights in step with its neighbours.

export const wipe = defineEffect({
  id: "wipe",
  name: "Wipe",
  icon: "🧹",
  props: z.object({
    color: inspectableProps.color,
    /** Which way it sweeps, seen from the front: 0 left to right, 90 bottom to top. */
    angle: inspectableProps.bounded(0, 360),
    /** How soft its leading edge is, as a share of the house. */
    softness: inspectableProps.bounded(0, 1),
    /** Leave the LEDs lit behind it (else only the edge shows). */
    trail: inspectableProps.bounded(0, 1),
  }),
  defaults: { color: [255, 255, 255], angle: 0, softness: 0.1, trail: 1 },
  render: function Wipe({ string, props }) {
    const timing = useEffectTiming();
    useEffectFrame(() => {
      const radians = (props.angle * Math.PI) / 180;
      const dx = Math.cos(radians);
      const dy = Math.sin(radians);
      // Where each LED falls along the sweep, 0 where it starts to 1 where it ends.
      const reach = Math.abs(dx) + Math.abs(dy);
      const offset = (Math.min(0, dx) + Math.min(0, dy)) * -1;
      const edge = timing.effectPlaybackRatio * (1 + props.softness);

      for (let i = 0; i < string.ledCount; i++) {
        const p = string.getNormalisedPosition(i);
        const along = (p.x * dx + p.y * dy + offset) / reach;
        const behind = edge - along;
        if (behind < 0) continue;
        const inEdge =
          props.softness > 0 ? Math.min(1, behind / props.softness) : 1;
        const level = behind > props.softness ? props.trail : inEdge;
        if (level <= 0) continue;
        string.setPixel(
          i,
          Math.round(props.color[0] * level),
          Math.round(props.color[1] * level),
          Math.round(props.color[2] * level),
        );
      }
    });
    return null;
  },
});
