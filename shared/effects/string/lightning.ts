import { useRef } from "react";
import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame } from "../api";
import { inspectableProps } from "../inspectableProps";

interface LightningBolt {
  startFrame: number;
  centerPosition: number;
  intensity: number;
  spread: number;
}

export const lightning = defineEffect({
  id: "lightning",
  name: "Lightning",
  icon: "⚡",
  props: z.object({
    strikeChance: inspectableProps.bounded(0, 1),
    intensity: inspectableProps.bounded(0, 10),
    fadeSpeed: inspectableProps.bounded(0, 1),
    minSpread: inspectableProps.bounded(0, 1000),
    maxSpread: inspectableProps.bounded(0, 1000),
  }),
  defaults: {
    strikeChance: 0.05,
    intensity: 1,
    fadeSpeed: 0.7,
    minSpread: 3,
    maxSpread: 8,
  },
  render: function Lightning({ string, props }) {
    const boltsRef = useRef<LightningBolt[]>([]);
    const brightnessMapRef = useRef<number[]>([]);

    useEffectFrame((frame, random) => {
      const ledCount = string.ledCount;

      // Initialize brightness map if needed
      if (brightnessMapRef.current.length !== ledCount)
        brightnessMapRef.current = new Array(ledCount).fill(0);

      const brightness = brightnessMapRef.current;

      // Decay existing brightness
      for (let i = 0; i < ledCount; i++)
        brightness[i] = Math.max(0, brightness[i] * props.fadeSpeed);

      // Randomly spawn new lightning bolts
      if (random.next() < props.strikeChance) {
        const centerPos = random.next() * ledCount;
        const intensity = 0.7 + random.next() * 0.3;
        const spread =
          props.minSpread + random.next() * (props.maxSpread - props.minSpread);

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
            bolt.centerPosition + (random.next() - 0.5) * bolt.spread * 0.3;

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
        const variation = random.next() * 0.1;

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
        } else
          // Darkness
          string.setPixel(i, 0, 0, 0);
      }
    });
    return null;
  },
});
