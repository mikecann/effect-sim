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
    /** Which way it sweeps around the house, seen from above: 0 along +x, 90 along +z. */
    angle: inspectableProps.bounded(0, 360),
    /** How steeply it climbs: 0 level, 90 straight up from the bottom, -90 down from the top. */
    tilt: inspectableProps.bounded(-90, 90),
    /** How soft its leading edge is, as a share of the house. */
    softness: inspectableProps.bounded(0, 1),
    /** Leave the LEDs lit behind it (else only the edge shows). */
    trail: inspectableProps.bounded(0, 1),
  }),
  defaults: {
    color: [255, 255, 255],
    angle: 0,
    tilt: 0,
    softness: 0.1,
    trail: 1,
  },
  render: function Wipe({ string, props }) {
    const timing = useEffectTiming();
    useEffectFrame(() => {
      const angle = (props.angle * Math.PI) / 180;
      const tilt = (props.tilt * Math.PI) / 180;
      const d = [
        Math.cos(tilt) * Math.cos(angle),
        Math.sin(tilt),
        Math.cos(tilt) * Math.sin(angle),
      ];
      // Where each LED falls along the sweep across the house's box: 0 at
      // the corner it starts from, 1 at the far one.
      const reach = d.reduce((sum, c) => sum + Math.abs(c), 0);
      const offset = -d.reduce((sum, c) => sum + Math.min(0, c), 0);
      const edge = timing.effectPlaybackRatio * (1 + props.softness);

      for (let i = 0; i < string.ledCount; i++) {
        const p = string.getNormalisedPosition(i);
        const along = (p.x * d[0] + p.y * d[1] + p.z * d[2] + offset) / reach;
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
