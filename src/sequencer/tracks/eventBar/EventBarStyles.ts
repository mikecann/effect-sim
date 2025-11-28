import { ROW_HEIGHT } from "../../sequencer";

export const EVENT_BAR_STYLES = {
  container: (
    pxLeft: number,
    pxWidth: number,
    isCompletelyOutOfBounds: boolean,
    isDragging: boolean,
    isSelected: boolean = false,
  ) => ({
    position: "absolute" as const,
    top: 2,
    left: pxLeft,
    width: pxWidth,
    height: ROW_HEIGHT - 4,
    background: isCompletelyOutOfBounds
      ? "var(--mantine-color-gray-7)"
      : isSelected
        ? "var(--mantine-color-blue-6)"
        : "var(--mantine-color-grape-7)",
    borderRadius: 4,
    border: `2px solid ${
      isSelected
        ? "var(--mantine-color-blue-4)"
        : isCompletelyOutOfBounds
          ? "var(--mantine-color-gray-5)"
          : "var(--mantine-color-grape-5)"
    }`,
    boxSizing: "border-box" as const,
    cursor: isDragging ? "grabbing" : "grab",
    userSelect: "none" as const,
    opacity: isCompletelyOutOfBounds ? 0.5 : 1,
    overflow: "visible" as const,
    boxShadow: isSelected ? "0 0 0 1px var(--mantine-color-blue-3)" : "none",
  }),

  label: (isCompletelyOutOfBounds: boolean) => ({
    position: "absolute" as const,
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    fontSize: 12,
    color: isCompletelyOutOfBounds ? "var(--mantine-color-gray-4)" : "white",
    overflow: "hidden",
  }),

  outOfBoundsOverlay: (left: number) => ({
    position: "absolute" as const,
    top: 0,
    left,
    right: 0,
    bottom: 0,
    background:
      "repeating-linear-gradient(45deg, rgba(255,255,255,0.1) 0px, rgba(255,255,255,0.1) 4px, transparent 4px, transparent 8px)",
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    pointerEvents: "none" as const,
  }),
};
