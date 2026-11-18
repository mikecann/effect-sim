import { useEffect, useRef } from "react";
import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame, useEffectRandom, useEffectTiming } from "../api";
import { inspectableProps } from "../inspectableProps";

interface FireflyData {
  travelDistance: number;
  spawnPosition: number;
  phase1: number;
  phase2: number;
  phase3: number;
  freq1: number;
  freq2: number;
  freq3: number;
}

export const fireflies = defineEffect({
  id: "fireflies",
  name: "Fireflies",
  icon: "🪲",
  props: z.object({
    color: inspectableProps.color,
    numFireflies: inspectableProps.bounded(0, 500),
    speed: inspectableProps.bounded(-100, 100),
    fadeRatio: inspectableProps.bounded(0, 1),
    minTravelDistance: inspectableProps.bounded(0, 1),
    maxTravelDistance: inspectableProps.bounded(0, 1),
  }),
  defaults: {
    color: [255, 230, 100],
    numFireflies: 3,
    speed: 0.3,
    fadeRatio: 0.9,
    minTravelDistance: 0.2,
    maxTravelDistance: 0.5,
  },
  render: function Fireflies({ string, props }) {
    const timing = useEffectTiming();
    const randomFor = useEffectRandom();
    const firefliesDataRef = useRef<FireflyData[]>([]);
    const lastLoopCountRef = useRef(timing.loopCount);

    // Regenerate fireflies when loop count changes
    useEffect(() => {
      if (
        lastLoopCountRef.current !== timing.loopCount ||
        firefliesDataRef.current.length === 0
      ) {
        lastLoopCountRef.current = timing.loopCount;
        const random = randomFor("fireflies", timing.loopCount);
        const data: FireflyData[] = [];

        for (let f = 0; f < props.numFireflies; f++)
          data.push({
            travelDistance:
              props.minTravelDistance +
              random.next() *
                (props.maxTravelDistance - props.minTravelDistance),
            spawnPosition: random.next(),
            phase1: random.next() * Math.PI * 2,
            phase2: random.next() * Math.PI * 2,
            phase3: random.next() * Math.PI * 2,
            freq1: Math.floor(random.next() * 2) + 1,
            freq2: Math.floor(random.next() * 2) + 2,
            freq3: Math.floor(random.next() * 3) + 3,
          });

        firefliesDataRef.current = data;
      }
    }, [
      props.numFireflies,
      props.minTravelDistance,
      props.maxTravelDistance,
      timing.loopCount,
      randomFor,
    ]);

    useEffectFrame(() => {
      if (props.fadeRatio !== 1) string.multiplyAll(props.fadeRatio);

      const adjustedRatio = (timing.effectPlaybackRatio * props.speed) % 1;
      const time = adjustedRatio * Math.PI * 2;

      for (let f = 0; f < firefliesDataRef.current.length; f++) {
        const firefly = firefliesDataRef.current[f];

        // Create multiple overlapping sine waves with different frequencies
        const wave1 = Math.sin(time * firefly.freq1 + firefly.phase1) * 0.5;
        const wave2 = Math.sin(time * firefly.freq2 + firefly.phase2) * 0.3;
        const wave3 = Math.sin(time * firefly.freq3 + firefly.phase3) * 0.2;

        // Combine all waves (weighted average)
        const combinedOffset = wave1 + wave2 + wave3;

        // Apply the wiggle offset to the spawn position, scaled by travel distance
        const normalizedPos =
          firefly.spawnPosition +
          combinedOffset * (firefly.travelDistance * 0.5);

        // Clamp to valid range and map to LED position
        const clampedPos = Math.max(0, Math.min(1, normalizedPos));
        const ledPosition = clampedPos * (string.ledCount - 1);
        const centerIndex = Math.floor(ledPosition);

        // Add brightness falloff for smooth particle appearance
        const falloffRadius = 2;
        for (let i = -falloffRadius; i <= falloffRadius; i++) {
          const ledIndex = centerIndex + i;
          if (ledIndex < 0 || ledIndex >= string.ledCount) continue;

          const distance = Math.abs(ledPosition - ledIndex);
          const brightness = Math.max(0, 1 - distance / (falloffRadius + 1));

          if (brightness > 0) {
            const [currentR, currentG, currentB] = string.getPixel(ledIndex);
            const r = Math.min(
              255,
              currentR + Math.round(props.color[0] * brightness),
            );
            const g = Math.min(
              255,
              currentG + Math.round(props.color[1] * brightness),
            );
            const b = Math.min(
              255,
              currentB + Math.round(props.color[2] * brightness),
            );

            string.setPixel(ledIndex, r, g, b);
          }
        }
      }
    });
    return null;
  },
});
