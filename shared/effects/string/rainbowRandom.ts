import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame } from "../api";
import { inspectableProps } from "../inspectableProps";

export const rainbowRandom = defineEffect({
  id: "rainbowRandom",
  name: "Rainbow Random",
  icon: "🌈",
  props: z.object({
    delayMs: inspectableProps.bounded(0, 60_000),
  }),
  defaults: { delayMs: 0 },
  render: function RainbowRandom({ string, props }) {
    useEffectFrame((frame, random) => {
      const framesPerUpdate = Math.max(1, Math.floor(props.delayMs / 16));
      if (frame % framesPerUpdate !== 0) return;
      for (let i = 0; i < string.ledCount; i++)
        string.setPixel(
          i,
          Math.floor(random.next() * 256),
          Math.floor(random.next() * 256),
          Math.floor(random.next() * 256),
        );
    });
    return null;
  },
});
