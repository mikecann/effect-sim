import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame } from "../api";
import { inspectableProps } from "../inspectableProps";

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  const mod = i % 6;
  if (mod === 0) return [v * 255, t * 255, p * 255];
  if (mod === 1) return [q * 255, v * 255, p * 255];
  if (mod === 2) return [p * 255, v * 255, t * 255];
  if (mod === 3) return [p * 255, q * 255, v * 255];
  if (mod === 4) return [t * 255, p * 255, v * 255];
  return [v * 255, p * 255, q * 255];
}

export const rainbowWave = defineEffect({
  id: "rainbowWave",
  name: "Rainbow Wave",
  icon: "🌊",
  props: z.object({
    speed: inspectableProps.bounded(-100, 100),
    wavelength: inspectableProps.bounded(0, 100),
  }),
  defaults: { speed: 1, wavelength: 1 },
  render: function RainbowWave({ string, props }) {
    useEffectFrame((f) => {
      const timeOffset = f.ratio * props.speed;

      for (let i = 0; i < string.ledCount; i++) {
        const positionRatio = i / string.ledCount;
        const wavePhase =
          (positionRatio * props.wavelength + timeOffset) * Math.PI * 2;
        const brightness = Math.sin(wavePhase) * 0.5 + 0.5;

        const hue = (positionRatio * props.wavelength + timeOffset) % 1;
        const [r, g, b] = hsvToRgb(hue, 1, brightness);

        string.setPixel(i, Math.round(r), Math.round(g), Math.round(b));
      }
    });
    return null;
  },
});
