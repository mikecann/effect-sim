import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import type { z } from "zod";
import { autorun } from "mobx";
import { useEffect } from "react";
import { useEffectContext } from "../EffectProvider";

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

export function RainbowWave({
  string,
  props = stringEffectDefinitions.rainbowWave.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.rainbowWave.props>;
}) {
  const model = useEffectContext();

  useEffect(
    () =>
      autorun(() => {
        const timeOffset = model.effectPlaybackRatio * props.speed;

        for (let i = 0; i < string.ledCount; i++) {
          const positionRatio = i / string.ledCount;
          const wavePhase =
            (positionRatio * props.wavelength + timeOffset) * Math.PI * 2;
          const brightness = Math.sin(wavePhase) * 0.5 + 0.5;

          const hue = (positionRatio * props.wavelength + timeOffset) % 1;
          const [r, g, b] = hsvToRgb(hue, 1, brightness);

          string.setPixel(i, Math.round(r), Math.round(g), Math.round(b));
        }
      }),
    [string, props.speed, props.wavelength],
  );

  return null;
}
