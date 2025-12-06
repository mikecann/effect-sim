import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import { seededRandom } from "../../../../shared/random";
import type { z } from "zod";
import { useRef } from "react";
import { useEffectContext } from "../EffectProvider";
import { autorun } from "mobx";
import { useEffect } from "react";

interface LightningBolt {
  startFrame: number;
  centerPosition: number;
  intensity: number;
  spread: number;
}

export function Lightning({
  string,
  props = stringEffectDefinitions.lightning.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.lightning.props>;
}) {
  const model = useEffectContext();
  const boltsRef = useRef<LightningBolt[]>([]);
  const brightnessMapRef = useRef<number[]>([]);

  useEffect(
    () =>
      autorun(() => {
        const ledCount = string.ledCount;
        const frame = model.effectFrame;

        // Initialize brightness map if needed
        if (brightnessMapRef.current.length !== ledCount)
          brightnessMapRef.current = new Array(ledCount).fill(0);

        const brightness = brightnessMapRef.current;

        // Decay existing brightness
        for (let i = 0; i < ledCount; i++)
          brightness[i] = Math.max(0, brightness[i] * props.fadeSpeed);

        // Randomly spawn new lightning bolts
        if (seededRandom(frame, 0) < props.strikeChance) {
          const centerPos = seededRandom(frame, 1) * ledCount;
          const intensity = 0.7 + seededRandom(frame, 2) * 0.3;
          const spread =
            props.minSpread +
            seededRandom(frame, 3) * (props.maxSpread - props.minSpread);

          boltsRef.current.push({
            startFrame: frame,
            centerPosition: centerPos,
            intensity,
            spread,
          });
        }

        // Update and render active bolts
        boltsRef.current = boltsRef.current.filter((bolt) => {
          const age = frame - bolt.startFrame;
          if (age > 8) return false; // Remove old bolts

          // Lightning brightness curve: instant bright flash, then quick decay
          const timeFactor = age === 0 ? 1 : Math.exp(-age * 0.8);
          const boltBrightness = bolt.intensity * timeFactor;

          // Add multiple strike points with branching
          const numStrikes = age === 0 ? 2 : 1;
          for (let s = 0; s < numStrikes; s++) {
            const strikeCenter =
              bolt.centerPosition +
              (seededRandom(frame * 1000 + s, 4) - 0.5) * bolt.spread * 0.3;

            // Apply brightness to LEDs near strike point
            for (let i = 0; i < ledCount; i++) {
              const distance = Math.abs(i - strikeCenter);
              const spreadFactor = Math.exp(
                -(distance * distance) / (bolt.spread * bolt.spread * 2),
              );
              const ledBrightness = boltBrightness * spreadFactor;

              brightness[i] = Math.max(brightness[i], ledBrightness);
            }
          }

          return true;
        });

        // Render to LEDs with lightning colors (white/blue/purple)
        for (let i = 0; i < ledCount; i++) {
          const b = brightness[i] * props.intensity;
          const variation = seededRandom(frame * 100 + i, 5) * 0.1;

          // Color shifts from white (high intensity) to blue/purple (lower intensity)
          if (b > 0.7) {
            // Bright white core
            const white = Math.min(255, Math.round(b * 255));
            string.setPixel(i, white, white, white);
          } else if (b > 0.3) {
            // Electric blue
            const intensity = b * 255;
            string.setPixel(
              i,
              Math.round(intensity * (0.6 + variation)),
              Math.round(intensity * (0.8 + variation)),
              Math.round(intensity),
            );
          } else if (b > 0.05) {
            // Purple glow
            const intensity = b * 255;
            string.setPixel(
              i,
              Math.round(intensity * (0.7 + variation)),
              Math.round(intensity * (0.3 + variation)),
              Math.round(intensity * (0.9 + variation)),
            );
          } else {
            // Darkness
            string.setPixel(i, 0, 0, 0);
          }
        }
      }),
    [
      string,
      props.strikeChance,
      props.intensity,
      props.fadeSpeed,
      props.minSpread,
      props.maxSpread,
    ],
  );

  return null;
}
