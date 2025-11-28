import { useRef, useEffect } from "react";
import { useSequence } from "../SequencerContext";
import { autorun } from "mobx";

export function PlayheadIndicator() {
  const sequence = useSequence();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      autorun(() => {
        const el = ref.current;
        if (!el) return;
        el.style.left = `${sequence.runtime.playhead.frame * sequence.frameWidth}px`;
      }),
    [sequence, ref],
  );

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: 1,
        background: "var(--mantine-color-blue-5)",
        pointerEvents: "none",
        zIndex: 10,
      }}
    />
  );
}
