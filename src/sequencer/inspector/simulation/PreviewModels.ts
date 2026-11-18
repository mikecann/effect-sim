import { makeAutoObservable } from "mobx";
import type {
  EffectString,
  EffectTiming,
} from "../../../../shared/effects/api";
import {
  normaliseInBounds,
  type Bounds,
  type Point3,
} from "../../../../shared/geometry/stringLayout";
import { hashSeed } from "../../../../shared/random";

export const PREVIEW_COLUMNS = 20;
export const PREVIEW_ROWS = 5;
const SPACING_M = 0.1;

/** How long the preview's event lasts, in frames. */
export const PREVIEW_FRAMES = 100;

/**
 * A pretend string for the inspector's preview: a grid of LEDs read left to
 * right, top to bottom, so spatial effects show their shape too.
 */
export class PreviewString implements EffectString {
  readonly key = "preview";
  readonly ledCount = PREVIEW_COLUMNS * PREVIEW_ROWS;
  readonly data = new Uint8Array(this.ledCount * 3);
  readonly bounds: Bounds = {
    min: { x: 0, y: 0, z: 0 },
    max: {
      x: (PREVIEW_COLUMNS - 1) * SPACING_M,
      y: (PREVIEW_ROWS - 1) * SPACING_M,
      z: 0,
    },
  };

  setPixel(index: number, r: number, g: number, b: number) {
    if (index < 0 || index >= this.ledCount) return;
    this.data.set([r, g, b], index * 3);
  }

  setAllPixels(r: number, g: number, b: number) {
    for (let i = 0; i < this.ledCount; i++) this.setPixel(i, r, g, b);
  }

  getPixel(index: number): [number, number, number] {
    if (index < 0 || index >= this.ledCount) return [0, 0, 0];
    const base = index * 3;
    return [this.data[base], this.data[base + 1], this.data[base + 2]];
  }

  clear() {
    this.data.fill(0);
  }

  multiplyAll(byValue: number) {
    for (let i = 0; i < this.data.length; i++)
      this.data[i] = Math.floor(this.data[i] * byValue);
  }

  getPosition(index: number): Point3 {
    const column = index % PREVIEW_COLUMNS;
    const row = Math.floor(index / PREVIEW_COLUMNS);
    return {
      x: column * SPACING_M,
      y: (PREVIEW_ROWS - 1 - row) * SPACING_M,
      z: 0,
    };
  }

  getNormalisedPosition(index: number): Point3 {
    return normaliseInBounds(this.getPosition(index), this.bounds);
  }
}

/** The preview's clock: the event plays over and over. */
export class PreviewTiming implements EffectTiming {
  effectFrame = 0;
  loopCount = 0;
  readonly duration = PREVIEW_FRAMES;
  readonly seed: number;

  constructor(seedKey: string) {
    this.seed = hashSeed(seedKey, "preview");
    makeAutoObservable(this);
  }

  get effectPlaybackRatio() {
    return this.effectFrame / this.duration;
  }

  /** The next frame; true when that started the event over. */
  step(): boolean {
    if (this.effectFrame + 1 < this.duration) {
      this.effectFrame++;
      return false;
    }
    this.effectFrame = 0;
    this.loopCount++;
    return true;
  }
}
