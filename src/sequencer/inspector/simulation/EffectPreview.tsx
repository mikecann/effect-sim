import { Box } from "@mantine/core";
import { useEffect, useMemo, useRef } from "react";
import { EffectScopeContext } from "../../../../shared/effects/api";
import type { StringEffect } from "../../../../shared/effects/defineEffect";
import { PREVIEW_COLUMNS, PreviewString, PreviewTiming } from "./PreviewModels";

const FRAME_MS = 1000 / 40;
const BOX_PX = 12;

/** The effect on its own, on a small grid of pretend LEDs, looping. */
export function EffectPreview({
  effect,
  rawProps,
  seedKey,
}: {
  effect: StringEffect;
  rawProps: unknown;
  seedKey: string;
}) {
  const string = useMemo(() => new PreviewString(), []);
  const timing = useMemo(() => new PreviewTiming(seedKey), [seedKey]);
  const scope = useMemo(
    () => ({ timing, target: string.key }),
    [timing, string],
  );
  const boxes = useRef<Array<HTMLDivElement | null>>([]);

  // Start clean whenever the effect or its props change.
  useEffect(() => string.clear(), [string, effect, rawProps]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      if (timing.step()) string.clear();
      boxes.current.forEach((box, i) => {
        if (!box) return;
        const [r, g, b] = string.getPixel(i);
        box.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timing, string]);

  const Run = effect.Run;
  return (
    <>
      <EffectScopeContext value={scope}>
        <Run string={string} rawProps={rawProps} />
      </EffectScopeContext>
      <Box
        data-testid="effect-preview"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${PREVIEW_COLUMNS}, ${BOX_PX}px)`,
          gap: 2,
        }}
      >
        {Array.from({ length: string.ledCount }, (_, i) => (
          <Box
            key={i}
            ref={(el) => {
              boxes.current[i] = el;
            }}
            style={{
              width: BOX_PX,
              height: BOX_PX,
              backgroundColor: "rgb(0, 0, 0)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: 2,
            }}
          />
        ))}
      </Box>
    </>
  );
}
