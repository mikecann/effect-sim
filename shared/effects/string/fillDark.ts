import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame } from "../api";
import { inspectableProps } from "../inspectableProps";

/**
 * Lifts every LED dimmer than `color` up towards it, and leaves brighter ones
 * alone. On a top track it keeps a sequence from ever going dark between its
 * flashes and chases: from a passing boat, a lit house beats a clever one.
 */
export const fillDark = defineEffect({
  id: "fillDark",
  name: "Fill the Dark",
  icon: "🕯️",
  props: z.object({
    color: inspectableProps.color,
  }),
  defaults: { color: [90, 60, 25] },
  render: function FillDark({ string, props }) {
    useEffectFrame(() => {
      const [br, bg, bb] = props.color;
      const floor = Math.max(br, bg, bb);
      if (floor <= 0) return;
      for (let i = 0; i < string.ledCount; i++) {
        const [r, g, b] = string.getPixel(i);
        const peak = Math.max(r, g, b);
        if (peak >= floor) continue;
        // Black becomes `color`; the nearer an LED is to the floor, the less it moves.
        const lift = 1 - peak / floor;
        string.setPixel(
          i,
          Math.min(255, Math.round(r + br * lift)),
          Math.min(255, Math.round(g + bg * lift)),
          Math.min(255, Math.round(b + bb * lift)),
        );
      }
    });
    return null;
  },
});
