import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import type { z } from "zod";
import { autorun } from "mobx";
import { useEffect } from "react";
import { useEffectContext } from "../EffectProvider";

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

  if (segmentIndex === 0) {
    // color1 -> color2
    return lerpColor(color1, color2, t);
  }
  if (segmentIndex === 1) {
    // color2 -> color3
    return lerpColor(color2, color3, t);
  }
  // segmentIndex === 2: color3 -> color1
  return lerpColor(color3, color1, t);
}

export function CycleSine({
  string,
  props = stringEffectDefinitions.cycleSine.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.cycleSine.props>;
}) {
  const model = useEffectContext();

  useEffect(
    () =>
      autorun(() => {
        const time = model.effectPlaybackRatio * props.speed * Math.PI * 2;

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
      }),
    [
      string,
      props.speed,
      props.spread,
      props.waveSpeed,
      props.wavelength,
      props.waveAmplitude,
      props.color1,
      props.color2,
      props.color3,
    ],
  );

  return null;
}

