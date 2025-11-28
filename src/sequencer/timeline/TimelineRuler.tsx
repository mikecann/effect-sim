import { useMemo, useRef, useState, useCallback } from "react";
import { Box } from "@mantine/core";
import { useSequence } from "../SequencerContext";
import { PlayheadIndicator } from "./PlayheadIndicator";
import { ROW_HEIGHT } from "../sequencer";
import { useWindowEvent } from "../../common/utils/useWindowEvent";

export default function TimelineRuler() {
  const sequence = useSequence();

  const [isScrubbing, setIsScrubbing] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const ticks = useMemo(
    () => buildTicks(sequence.sequenceNumFrames),
    [sequence.sequenceNumFrames],
  );

  const toFrame = useCallback(
    (clientX: number) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const x = clientX - rect.left;
      return Math.round(x / sequence.frameWidth);
    },
    [sequence.frameWidth],
  );

  const onScrub = useCallback(
    (frame: number) => {
      sequence.runtime.playhead.setFrame(
        Math.max(0, Math.min(frame, sequence.sequenceNumFrames)),
      );
    },
    [sequence, sequence.sequenceNumFrames],
  );

  // While scrubbing, listen on the window so dragging continues when the cursor leaves the ruler
  useWindowEvent(
    "mousemove",
    (e: MouseEvent) => {
      onScrub(toFrame(e.clientX));
    },
    isScrubbing,
  );

  useWindowEvent("mouseup", () => setIsScrubbing(false), isScrubbing);

  return (
    <Box
      ref={rootRef}
      style={{
        position: "relative",
        width: sequence.sequenceNumFrames * sequence.frameWidth,
        height: ROW_HEIGHT,
        borderBottom: "1px solid var(--mantine-color-dark-5)",
        background: "var(--mantine-color-dark-7)",
        overflow: "hidden",
        userSelect: "none",
      }}
      onMouseDown={(e) => {
        setIsScrubbing(true);
        onScrub(toFrame(e.clientX));
      }}
      onMouseMove={(e) => {
        if (!isScrubbing) return;
        onScrub(toFrame(e.clientX));
      }}
      onMouseUp={() => setIsScrubbing(false)}
    >
      {/* tick marks */}
      <div style={{ position: "absolute", inset: 0 }}>
        {ticks.map((t) => (
          <div
            key={t.frame}
            style={{
              position: "absolute",
              left: t.frame * sequence.frameWidth,
              top: 0,
              height: "100%",
            }}
          >
            <div
              style={{
                position: "absolute",
                bottom: 0,
                width: 1,
                height: t.height,
                background: "var(--mantine-color-dark-2)",
              }}
            />
            {t.label && (
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  left: 4,
                  fontSize: 10,
                  color: "var(--mantine-color-gray-4)",
                }}
              >
                {t.label}
              </div>
            )}
          </div>
        ))}
      </div>

      <PlayheadIndicator />
    </Box>
  );
}

function buildTicks(
  totalFrames: number,
): Array<{ frame: number; height: number; label?: string }> {
  const result: Array<{ frame: number; height: number; label?: string }> = [];
  for (let f = 0; f <= totalFrames; f++) {
    const isMajor = f % 10 === 0;
    const isMedium = f % 5 === 0;
    const height = isMajor ? 16 : isMedium ? 10 : 6;
    const label = isMajor ? `${f}` : undefined;
    result.push({ frame: f, height, label });
  }
  return result;
}
