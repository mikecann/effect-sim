import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import type { z } from "zod";
import { useRef, useEffect } from "react";
import { useEffectContext, useEffectFrame } from "../EffectProvider";

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

export function BouncingBalls({
  string,
  props = stringEffectDefinitions.bouncingBalls.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.bouncingBalls.props>;
}) {
  const model = useEffectContext();
  const ballsRef = useRef<Ball[]>([]);
  const lastLoopCountRef = useRef(model.loopCount);
  const lastTimeRef = useRef(0);

  // Initialize balls when loop resets or ball count changes
  useEffect(() => {
    if (
      lastLoopCountRef.current !== model.loopCount ||
      ballsRef.current.length !== props.numBalls
    ) {
      lastLoopCountRef.current = model.loopCount;
      lastTimeRef.current = 0;

      const balls: Ball[] = [];
      for (let i = 0; i < props.numBalls; i++) {
        // Random starting position
        const startPos = Math.random();
        // Random direction and varied speeds
        const direction = Math.random() > 0.5 ? 1 : -1;
        const speedVariation = 0.5 + Math.random(); // 0.5 to 1.5x base speed

        balls.push({
          position: startPos,
          velocity: direction * speedVariation,
          color: ballColors[i % ballColors.length],
        });
      }
      ballsRef.current = balls;
    }
  }, [props.numBalls, model.loopCount]);

  useEffectFrame(() => {
    const currentTime = model.effectPlaybackRatio;
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
}
