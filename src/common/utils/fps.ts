/** A frame rate the frame loop can run: 1 to 120, or 60 when it's not a number. */
export const clampFps = (fps: number) =>
  Number.isFinite(fps) && fps > 0 ? Math.min(120, Math.max(1, fps)) : 60;
