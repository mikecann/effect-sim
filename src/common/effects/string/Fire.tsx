import type { StringLedDataApi } from "../../../data/StringLedDataModel";
import { stringEffectDefinitions } from "../stringEffectDefinitions";
import { seededRandom } from "../../../../shared/random";
import type { z } from "zod";
import { useRef } from "react";
import { useEffectContext } from "../EffectProvider";
import { autorun } from "mobx";
import { useEffect } from "react";

// Fire color palette - maps heat (0-1) to RGB
// Black → Dark Red → Red → Orange → Yellow → White
function heatToColor(heat: number): [number, number, number] {
  const h = Math.max(0, Math.min(1, heat));

  if (h < 0.25) {
    // Black to dark red
    const t = h / 0.25;
    return [Math.round(t * 80), 0, 0];
  }
  if (h < 0.5) {
    // Dark red to bright red/orange
    const t = (h - 0.25) / 0.25;
    return [Math.round(80 + t * 175), Math.round(t * 60), 0];
  }
  if (h < 0.75) {
    // Orange to yellow
    const t = (h - 0.5) / 0.25;
    return [255, Math.round(60 + t * 195), Math.round(t * 30)];
  }
  // Yellow to white-hot
  const t = (h - 0.75) / 0.25;
  return [255, 255, Math.round(30 + t * 225)];
}

export function Fire({
  string,
  props = stringEffectDefinitions.fire.defaultProps,
}: {
  string: StringLedDataApi;
  props?: z.infer<typeof stringEffectDefinitions.fire.props>;
}) {
  const model = useEffectContext();
  const heatMapRef = useRef<number[]>([]);

  useEffect(
    () =>
      autorun(() => {
        const ledCount = string.ledCount;

        // Initialize heat map if needed
        if (heatMapRef.current.length !== ledCount)
          heatMapRef.current = new Array(ledCount).fill(0);

        const heat = heatMapRef.current;
        const frame = model.effectFrame;

        // Step 1: Cool down every cell slightly
        for (let i = 0; i < ledCount; i++) {
          const cooldown =
            props.cooling * (1 + seededRandom(frame * ledCount + i, 0) * 0.5);
          heat[i] = Math.max(0, heat[i] - cooldown);
        }

        // Step 2: Heat rises - each cell gets heat from cells "below" it
        // We go from top to bottom so we don't propagate heat twice
        for (let i = ledCount - 1; i >= 2; i--) {
          heat[i] =
            (heat[i - 1] + heat[i - 2] + heat[i - 2]) / 3 +
            (seededRandom(frame * 1000 + i, 1) - 0.5) * 0.05;
        }

        // Step 3: Randomly ignite new sparks at the bottom
        const sparkChance = props.sparking;
        for (let i = 0; i < Math.ceil(ledCount * 0.1); i++) {
          if (seededRandom(frame * 100 + i, 2) < sparkChance) {
            const sparkIndex = Math.floor(
              seededRandom(frame * 100 + i, 3) * Math.min(7, ledCount * 0.15),
            );
            heat[sparkIndex] = Math.min(
              1,
              heat[sparkIndex] +
                0.5 +
                seededRandom(frame * 100 + i, 4) * 0.5 * props.intensity,
            );
          }
        }

        // Step 4: Map heat to colors and render
        for (let i = 0; i < ledCount; i++) {
          const [r, g, b] = heatToColor(heat[i] * props.intensity);
          string.setPixel(i, r, g, b);
        }
      }),
    [string, props.cooling, props.sparking, props.intensity],
  );

  return null;
}

