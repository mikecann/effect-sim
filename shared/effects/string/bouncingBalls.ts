import { useEffect, useRef } from "react";
import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame, useEffectRandom, useEffectTiming } from "../api";
import { inspectableProps } from "../inspectableProps";

// Vibrant ball colors
const ballColors = [
  [255, 50, 50], // Red
  [50, 255, 50], // Green
  [50, 100, 255], // Blue
  [255, 255, 50], // Yellow
  [255, 50, 255], // Magenta
  [50, 255, 255], // Cyan
  [255, 150, 50], // Orange
  [255, 255, 255], // White
] as const;

interface Ball {
  position: number; // 0 to 1
  velocity: number; // Speed and direction
  color: readonly [number, number, number];
}

export const bouncingBalls = defineEffect({
  id: "bouncingBalls",
  name: "Bouncing Balls",
  icon: "🎾",
  props: z.object({
    numBalls: inspectableProps.bounded(0, 100),
    speed: inspectableProps.bounded(-100, 100),
    size: inspectableProps.bounded(0, 1000),
    intensity: inspectableProps.bounded(0, 10),
  }),
  defaults: { numBalls: 3, speed: 1, size: 3, intensity: 1 },
  render: function BouncingBalls({ string, props }) {
    const timing = useEffectTiming();
    const randomFor = useEffectRandom();
    const ballsRef = useRef<Ball[]>([]);
    const lastLoopCountRef = useRef(timing.loopCount);
    const lastTimeRef = useRef(0);

    // Initialize balls when loop resets or ball count changes
    useEffect(() => {
      if (
        lastLoopCountRef.current !== timing.loopCount ||
        ballsRef.current.length !== props.numBalls
      ) {
        lastLoopCountRef.current = timing.loopCount;
        lastTimeRef.current = 0;
        const random = randomFor("balls", timing.loopCount);

        const balls: Ball[] = [];
        for (let i = 0; i < props.numBalls; i++) {
          // Random starting position
          const startPos = random.next();
          // Random direction and varied speeds
          const direction = random.next() > 0.5 ? 1 : -1;
          const speedVariation = 0.5 + random.next(); // 0.5 to 1.5x base speed

          balls.push({
            position: startPos,
            velocity: direction * speedVariation,
            color: ballColors[i % ballColors.length],
          });
        }
        ballsRef.current = balls;
      }
    }, [props.numBalls, timing.loopCount, randomFor]);

    useEffectFrame((f) => {
      const currentTime = f.ratio;
      const deltaTime = currentTime - lastTimeRef.current;

      // Handle loop wrap-around
      if (deltaTime < 0) {
        lastTimeRef.current = 0;
        return;
      }

      lastTimeRef.current = currentTime;

      // Scale delta time
      const dt = deltaTime * 3 * props.speed;

      // Step each ball, bouncing off the ends. New objects rather than
      // mutating the old ones, which the React compiler treats as frozen.
      ballsRef.current = ballsRef.current.map((ball) => {
        const position = ball.position + ball.velocity * dt;
        if (position < 0)
          return {
            ...ball,
            position: -position,
            velocity: Math.abs(ball.velocity),
          };
        if (position > 1)
          return {
            ...ball,
            position: 2 - position,
            velocity: -Math.abs(ball.velocity),
          };
        return { ...ball, position };
      });

      // Render balls
      for (const ball of ballsRef.current) {
        const ledIndex = Math.floor(ball.position * (string.ledCount - 1));

        // Draw ball with size
        const halfSize = Math.floor((props.size - 1) / 2);
        for (let offset = -halfSize; offset <= halfSize; offset++) {
          const idx = ledIndex + offset;
          if (idx < 0 || idx >= string.ledCount) continue;

          // Fade towards edges of ball
          const distFromCenter = Math.abs(offset) / (halfSize + 1);
          const brightness = props.intensity * (1 - distFromCenter * 0.5);

          // Add to existing color (allows overlapping balls)
          const [cr, cg, cb] = string.getPixel(idx);
          string.setPixel(
            idx,
            Math.min(255, cr + ball.color[0] * brightness),
            Math.min(255, cg + ball.color[1] * brightness),
            Math.min(255, cb + ball.color[2] * brightness),
          );
        }
      }
    });
    return null;
  },
});
