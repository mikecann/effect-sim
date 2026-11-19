import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render } from "react-nil";
import { makeAutoObservable } from "mobx";
import { EffectScopeContext, type EffectTiming } from "./api";
import { radialPulse } from "./string/radialPulse";
import { hashSeed } from "../random";
import { PreviewString } from "../../src/sequencer/inspector/simulation/PreviewModels";

class Timing implements EffectTiming {
  effectFrame = 10;
  loopCount = 0;
  duration = 100;
  seed = hashSeed("radial-pulse-test");
  constructor() {
    makeAutoObservable(this);
  }
  get effectPlaybackRatio() {
    return this.effectFrame / this.duration;
  }
}

const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("radialPulse", () => {
  it("draws only its ring, leaving what's under it", async () => {
    const string = new PreviewString();
    string.setAllPixels(10, 20, 30);
    const timing = new Timing();
    render(
      createElement(
        EffectScopeContext.Provider,
        { value: { timing, target: string.key } },
        createElement(radialPulse.Run, {
          string,
          rawProps: { ...radialPulse.defaults, width: 0.05, rings: 1 },
        }),
      ),
    );
    await settle();
    render(null);
    await settle();
    const pixels = Array.from({ length: string.ledCount }, (_, i) =>
      string.getPixel(i),
    );
    // Some LEDs are on the ring, and the rest keep their colour.
    expect(pixels.some(([r, g, b]) => r !== 10 || g !== 20 || b !== 30)).toBe(
      true,
    );
    expect(pixels.filter(([r, g, b]) => r === 10 && g === 20 && b === 30).length).toBeGreaterThan(string.ledCount / 2);
    expect(pixels.some(([r, g, b]) => r === 0 && g === 0 && b === 0)).toBe(
      false,
    );
  });
});
