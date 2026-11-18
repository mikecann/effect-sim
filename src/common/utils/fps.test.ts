import { expect, it } from "vitest";
import { clampFps } from "./fps";

it("keeps the frame rate to one the loop can run", () => {
  expect(clampFps(15)).toBe(15);
  expect(clampFps(Infinity)).toBe(60);
  expect(clampFps(1e12)).toBe(120);
  expect(clampFps(0)).toBe(60);
  expect(clampFps(Number.NaN)).toBe(60);
  expect(clampFps(0.01)).toBe(1);
});
