import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame } from "../api";
import { inspectableProps } from "../inspectableProps";

// Aurora color palette - greens, cyans, and purples
const auroraColors = [
  [0, 255, 100], // bright green
  [0, 200, 150], // teal
  [50, 150, 255], // cyan-blue
  [100, 50, 255], // purple
  [200, 50, 200], // magenta
] as const;

function lerpColor(
  color1: readonly [number, number, number],
  color2: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(color1[0] + (color2[0] - color1[0]) * t),
    Math.round(color1[1] + (color2[1] - color1[1]) * t),
    Math.round(color1[2] + (color2[2] - color1[2]) * t),
  ];
}

function getAuroraColor(position: number): [number, number, number] {
  const scaledPos = (((position % 1) + 1) % 1) * (auroraColors.length - 1);
  const index = Math.floor(scaledPos);
  const t = scaledPos - index;
  const nextIndex = Math.min(index + 1, auroraColors.length - 1);
  return lerpColor(auroraColors[index], auroraColors[nextIndex], t);
}

export const aurora = defineEffect({
  id: "aurora",
  name: "Aurora Borealis",
  icon: "🌌",
  props: z.object({
    speed: inspectableProps.bounded(-100, 100),
    intensity: inspectableProps.bounded(0, 10),
    colorSpread: inspectableProps.bounded(0, 100),
  }),
  defaults: { speed: 0.5, intensity: 1, colorSpread: 2 },
  render: function Aurora({ string, props }) {
    useEffectFrame((f) => {
      const time = f.ratio * props.speed * Math.PI * 2;

      for (let i = 0; i < string.ledCount; i++) {
        const position = i / string.ledCount;

        // Multiple overlapping waves at different frequencies for organic movement
        const wave1 = Math.sin(position * 4 + time) * 0.3;
        const wave2 = Math.sin(position * 7 - time * 0.7) * 0.2;
        const wave3 = Math.sin(position * 2 + time * 1.3) * 0.25;

        // Combine waves for a flowing color position
        const colorPosition =
          position * props.colorSpread + wave1 + wave2 + wave3 + time * 0.1;

        // Get base aurora color
        const [r, g, b] = getAuroraColor(colorPosition);

        // Create flowing brightness variation (like curtains of light)
        const curtain1 = Math.sin(position * 3 + time * 0.8) * 0.5 + 0.5;
        const curtain2 = Math.sin(position * 5 - time * 0.6) * 0.3 + 0.7;
        const curtain3 = Math.sin(position * 8 + time * 1.1) * 0.2 + 0.8;

        // Multiply curtains for varied brightness across the strip
        const brightness =
          curtain1 *
          curtain2 *
          curtain3 *
          props.intensity *
          (0.3 + Math.sin(time * 0.5) * 0.15 + 0.55);

        string.setPixel(
          i,
          Math.round(r * brightness),
          Math.round(g * brightness),
          Math.round(b * brightness),
        );
      }
    });
    return null;
  },
});
