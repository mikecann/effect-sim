import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import type { z } from "zod";
import { autorun } from "mobx";
import { useEffect } from "react";
import { useEffectContext } from "../EffectProvider";

// Lerp between two colors
function lerpColor(
  color1: readonly number[],
  color2: readonly number[],
  t: number,
): [number, number, number] {
  return [
    Math.round(color1[0] + (color2[0] - color1[0]) * t),
    Math.round(color1[1] + (color2[1] - color1[1]) * t),
    Math.round(color1[2] + (color2[2] - color1[2]) * t),
  ];
}

export function Plasma({
  string,
  props = stringEffectDefinitions.plasma.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.plasma.props>;
}) {
  const model = useEffectContext();

  useEffect(
    () =>
      autorun(() => {
        const time = model.effectPlaybackRatio * props.speed * Math.PI * 2;
        const ledCount = string.ledCount;

        for (let i = 0; i < ledCount; i++) {
          const x = i / ledCount;

          // Classic plasma formula: combine multiple sine waves
          // Wave 1: Horizontal sine wave
          const wave1 = Math.sin(x * props.scale * 10 + time);

          // Wave 2: Different frequency with time offset
          const wave2 = Math.sin(x * props.scale * 8 - time * 1.3);

          // Wave 3: Distance from a moving point (creates radial patterns)
          const cx = Math.sin(time * 0.7) * 0.5 + 0.5;
          const dist = Math.abs(x - cx);
          const wave3 = Math.sin(dist * props.scale * 15 + time * 0.9);

          // Wave 4: Another moving center point
          const cx2 = Math.cos(time * 0.4) * 0.5 + 0.5;
          const dist2 = Math.abs(x - cx2);
          const wave4 = Math.sin(dist2 * props.scale * 12 - time * 1.1);

          // Wave 5: Interference pattern
          const wave5 = Math.sin(
            (x * props.scale * 6 + time) * Math.cos(time * 0.3),
          );

          // Combine all waves with the complexity parameter
          const baseValue =
            (wave1 + wave2 + wave3 * props.complexity) / (2 + props.complexity);
          const extraValue = (wave4 + wave5) * props.complexity * 0.3;
          const combinedValue =
            (baseValue + extraValue) / (1 + props.complexity * 0.3);

          // Map to 0-1 range
          const normalized = combinedValue * 0.5 + 0.5;

          // Create color by interpolating from dark → base color → bright/white
          // This creates that classic plasma look with depth
          const baseColor = props.color;

          // Dark version of the color (towards black)
          const darkColor = [
            baseColor[0] * 0.1,
            baseColor[1] * 0.1,
            baseColor[2] * 0.1,
          ] as const;

          // Bright version (towards white, keeping some color tint)
          const brightColor = [
            Math.min(255, baseColor[0] + (255 - baseColor[0]) * 0.7),
            Math.min(255, baseColor[1] + (255 - baseColor[1]) * 0.7),
            Math.min(255, baseColor[2] + (255 - baseColor[2]) * 0.7),
          ] as const;

          // Use a sine-based curve for smoother transitions
          const curvedNorm = Math.sin(normalized * Math.PI * 0.5);

          // Interpolate: dark → base → bright based on plasma value
          let r: number, g: number, b: number;
          if (curvedNorm < 0.5) {
            // Dark to base color
            const t = curvedNorm * 2;
            [r, g, b] = lerpColor(darkColor, baseColor, t);
          } else {
            // Base color to bright
            const t = (curvedNorm - 0.5) * 2;
            [r, g, b] = lerpColor(baseColor, brightColor, t);
          }

          // Apply intensity with subtle pulsing
          const brightness = props.intensity * (0.9 + Math.sin(time * 2) * 0.1);

          string.setPixel(
            i,
            Math.round(r * brightness),
            Math.round(g * brightness),
            Math.round(b * brightness),
          );
        }
      }),
    [
      string,
      props.speed,
      props.scale,
      props.complexity,
      props.color,
      props.intensity,
    ],
  );

  return null;
}
