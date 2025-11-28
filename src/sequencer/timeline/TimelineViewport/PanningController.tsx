import { useSequence } from "../../SequencerContext";
import { useWindowEvent } from "../../../common/utils/useWindowEvent";

type PanningControllerProps = {
  containerRef: React.RefObject<HTMLDivElement | null>;
};

export function PanningController({ containerRef }: PanningControllerProps) {
  const sequence = useSequence();

  useWindowEvent("mousemove", (event) => {
    const container = containerRef.current;
    if (!container) return;
    sequence.handleMouseMove(container, event);
  });

  useWindowEvent("mouseup", () => sequence.handleMouseUp());

  return null;
}
