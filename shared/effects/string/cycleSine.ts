import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame } from "../api";
import { inspectableProps } from "../inspectableProps";

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

function getCycleColor(
  phase: number, // 0 to 1
  color1: readonly [number, number, number],
  color2: readonly [number, number, number],
  color3: readonly [number, number, number],
): [number, number, number] {
  // Phase cycles through: color1 -> color2 -> color3 -> color1
  const normalizedPhase = ((phase % 1) + 1) % 1;
  const segment = normalizedPhase * 3;
  const segmentIndex = Math.floor(segment);
  const t = segment - segmentIndex;

  if (segmentIndex === 0)
    // color1 -> color2
    return lerpColor(color1, color2, t);
  if (segmentIndex === 1)
    // color2 -> color3
    return lerpColor(color2, color3, t);
  // segmentIndex === 2: color3 -> color1
  return lerpColor(color3, color1, t);
}

export const cycleSine = defineEffect({
  id: "cycleSine",
  name: "Cycle Sine",
  icon: "🌊",
  props: z.object({
    color1: inspectableProps.color,
    color2: inspectableProps.color,
    color3: inspectableProps.color,
    speed: inspectableProps.bounded(-100, 100),
    spread: inspectableProps.bounded(0, 100),
    waveSpeed: inspectableProps.bounded(-100, 100),
    wavelength: inspectableProps.bounded(0, 100),
    waveAmplitude: inspectableProps.bounded(0, 10),
  }),
  defaults: {
    color1: [255, 0, 0],
    color2: [0, 255, 0],
    color3: [0, 0, 255],
    speed: 1,
    spread: 3,
    waveSpeed: 1,
    wavelength: 2,
    waveAmplitude: 0.2,
  },
  render: function CycleSine({ string, props }) {
    useEffectFrame((f) => {
      const time = f.ratio * props.speed * Math.PI * 2;

      for (let i = 0; i < string.ledCount; i++) {
        const position = i / string.ledCount;

        // Base phase offset based on position
        const baseOffset = position * props.spread;

        // Sine wave that oscillates the offset
        const sineOffset =
          Math.sin(time * props.waveSpeed + position * props.wavelength) *
          props.waveAmplitude;

        // Combined phase: base offset + sine wave offset + time-based cycling
        const phase = (baseOffset + sineOffset + time * 0.1) % 1;

        // Get color from the 3-color cycle
        const [r, g, b] = getCycleColor(
          phase,
          props.color1,
          props.color2,
          props.color3,
        );

        string.setPixel(i, r, g, b);
      }
    });
    return null;
  },
});
