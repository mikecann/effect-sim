import { useSequence } from "../../SequencerContext";

export function InactiveArea() {
  const sequence = useSequence();
  const left = sequence.sequenceNumFrames * sequence.frameWidth;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left,
        right: 0,
        background:
          "repeating-linear-gradient(90deg, rgba(128,128,128,0.05) 0px, rgba(128,128,128,0.05) 20px, rgba(128,128,128,0.1) 20px, rgba(128,128,128,0.1) 40px)",
        pointerEvents: "none",
        borderLeft: "2px solid var(--mantine-color-gray-6)",
      }}
    />
  );
}
