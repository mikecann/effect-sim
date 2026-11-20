import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render } from "react-nil";
import { makeAutoObservable } from "mobx";
import { EffectScopeContext, type EffectTiming } from "./api";
import { fillDark } from "./string/fillDark";
import { hashSeed } from "../random";
import { PreviewString } from "../../src/sequencer/inspector/simulation/PreviewModels";

class Timing implements EffectTiming {
  effectFrame = 0;
  loopCount = 0;
  duration = 10;
  seed = hashSeed("fill-dark-test");
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

describe("fillDark", () => {
  it("lifts dark LEDs to the floor and leaves bright ones alone", async () => {
    const string = new PreviewString();
    string.setAllPixels(0, 0, 0);
    string.setPixel(1, 255, 0, 0);
    string.setPixel(2, 50, 0, 0);
    render(
      createElement(
        EffectScopeContext.Provider,
        { value: { timing: new Timing(), target: string.key } },
        createElement(fillDark.Run, {
          string,
          rawProps: { color: [100, 60, 20] },
        }),
      ),
    );
    await settle();
    render(null);
    await settle();
    // Black becomes the floor colour.
    expect(string.getPixel(0)).toEqual([100, 60, 20]);
    // A full red is brighter than the floor, so it stays exactly as it was.
    expect(string.getPixel(1)).toEqual([255, 0, 0]);
    // A dim red is lifted halfway, and stays red-ish.
    expect(string.getPixel(2)).toEqual([100, 30, 10]);
  });
});
