import { Box, Group } from "@mantine/core";
import { useContext, useEffect, useRef } from "react";
import { LedDataStoreContext } from "../../../data/LedDataStoreContext";
import type { Id } from "../../../../convex/_generated/dataModel";
import { SIMULATED_LED_COUNT } from "./utils";

export function LedBoxes({ fakeStringId }: { fakeStringId: Id<"nodes"> }) {
  const ledDataContext = useContext(LedDataStoreContext);
  const boxRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (!ledDataContext) return;

    let rafId: number;

    const updateLedData = () => {
      const entry = ledDataContext.stringsMap.get(fakeStringId);
      const currentData = entry?.data;
      if (!currentData) {
        rafId = requestAnimationFrame(updateLedData);
        return;
      }

      for (let i = 0; i < SIMULATED_LED_COUNT; i++) {
        const box = boxRefs.current[i];
        if (!box) continue;
        const base = i * 3;
        const r = currentData[base] ?? 0;
        const g = currentData[base + 1] ?? 0;
        const b = currentData[base + 2] ?? 0;
        box.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
      }
      rafId = requestAnimationFrame(updateLedData);
    };

    rafId = requestAnimationFrame(updateLedData);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [ledDataContext, fakeStringId]);

  if (!ledDataContext) return null;

  return (
    <Group gap={2} mt="sm">
      {Array.from({ length: SIMULATED_LED_COUNT }, (_, i) => (
        <Box
          key={i}
          ref={(el) => {
            boxRefs.current[i] = el;
          }}
          style={{
            width: 12,
            height: 12,
            backgroundColor: "rgb(0, 0, 0)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            borderRadius: 2,
          }}
        />
      ))}
    </Group>
  );
}
