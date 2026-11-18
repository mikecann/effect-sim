import { useEffect, useRef } from "react";
import { z } from "zod";
import { defineEffect } from "../defineEffect";
import { useEffectFrame, useEffectRandom, useEffectTiming } from "../api";
import { inspectableProps } from "../inspectableProps";

interface TwinkleLedData {
  shouldApply: boolean;
  offset: number;
}

export const twinkle = defineEffect({
  id: "twinkle",
  name: "Twinkle",
  icon: "⭐",
  props: z.object({
    fromColor: inspectableProps.color,
    toColor: inspectableProps.color,
    speed: inspectableProps.bounded(-100, 100),
    ratioOfLedsToApplyTo: inspectableProps.bounded(0, 1),
  }),
  defaults: {
    fromColor: [0, 0, 0],
    toColor: [255, 230, 180],
    speed: 0.5,
    ratioOfLedsToApplyTo: 1,
  },
  render: function Twinkle({ string, props }) {
    const timing = useEffectTiming();
    const randomFor = useEffectRandom();
    const ledDataRef = useRef<TwinkleLedData[]>([]);
    const lastLoopCountRef = useRef(timing.loopCount);

    // Pre-compute which LEDs twinkle and their offsets
    useEffect(() => {
      if (
        lastLoopCountRef.current !== timing.loopCount ||
        ledDataRef.current.length !== string.ledCount
      ) {
        lastLoopCountRef.current = timing.loopCount;
        const random = randomFor("leds", timing.loopCount);
        const data: TwinkleLedData[] = [];
        for (let i = 0; i < string.ledCount; i++)
          data.push({
            shouldApply: random.next() < props.ratioOfLedsToApplyTo,
            offset: random.next(),
          });
        ledDataRef.current = data;
      }
    }, [
      string.ledCount,
      props.ratioOfLedsToApplyTo,
      timing.loopCount,
      randomFor,
    ]);

    useEffectFrame((f) => {
      const adjustedRatio = (f.ratio * props.speed) % 1;

      for (let i = 0; i < string.ledCount; i++) {
        const led = ledDataRef.current[i];
        if (!led || !led.shouldApply) continue;

        const ledRatio = (adjustedRatio + led.offset) % 1;
        const twinkleRatio = Math.sin(ledRatio * Math.PI * 2) * 0.5 + 0.5;

        const r = Math.round(
          props.fromColor[0] +
            (props.toColor[0] - props.fromColor[0]) * twinkleRatio,
        );
        const g = Math.round(
          props.fromColor[1] +
            (props.toColor[1] - props.fromColor[1]) * twinkleRatio,
        );
        const b = Math.round(
          props.fromColor[2] +
            (props.toColor[2] - props.fromColor[2]) * twinkleRatio,
        );

        string.setPixel(i, r, g, b);
      }
    });
    return null;
  },
});
