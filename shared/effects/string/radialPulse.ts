import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame, useEffectTiming } from "../api";
import { inspectableProps } from "../inspectableProps";
import { distance } from "../../geometry/stringLayout";

// Rings of light spreading out from a point on the house, measured in real
// metres between LEDs, so they stay round whatever shape the house is.

export const radialPulse = defineEffect({
  id: "radialPulse",
  name: "Radial Pulse",
  icon: "🎯",
  props: z.object({
    color: inspectableProps.color,
    /** Where the rings start, across the house's LEDs: 0 left, 1 right. */
    centerX: inspectableProps.bounded(0, 1),
    /** 0 bottom, 1 top. */
    centerY: inspectableProps.bounded(0, 1),
    /** 0 back, 1 front. */
    centerZ: inspectableProps.bounded(0, 1),
    /** How many rings go out over the event. */
    rings: inspectableProps.bounded(0, 50),
    /** How thick a ring is, in metres. */
    width: inspectableProps.bounded(0.01, 20),
  }),
  defaults: {
    color: [255, 255, 255],
    centerX: 0.5,
    centerY: 0.5,
    centerZ: 0.5,
    rings: 2,
    width: 0.75,
  },
  render: function RadialPulse({ string, props }) {
    const timing = useEffectTiming();
    useEffectFrame(() => {
      const { min, max } = string.bounds;
      const center = {
        x: min.x + (max.x - min.x) * props.centerX,
        y: min.y + (max.y - min.y) * props.centerY,
        z: min.z + (max.z - min.z) * props.centerZ,
      };
      // Far enough that the last ring leaves every corner of the house.
      const farthest =
        Math.hypot(
          Math.max(center.x - min.x, max.x - center.x),
          Math.max(center.y - min.y, max.y - center.y),
          Math.max(center.z - min.z, max.z - center.z),
        ) + props.width;
      const travelled =
        ((timing.effectPlaybackRatio * props.rings) % 1) * farthest;

      for (let i = 0; i < string.ledCount; i++) {
        const fromRing = Math.abs(
          distance(string.getPosition(i), center) - travelled,
        );
        const level = Math.max(0, 1 - fromRing / props.width);
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
