import { makeAutoObservable } from "mobx";
import { VirtualStringNodeModel } from "../../shared/models/VirtualStringNodeModel";
import { LedDataStoreModel } from "./LedDataStoreModel";
import { VirtualPixelModel } from "./VirtualPixelModel";
import type { EffectString } from "../../shared/effects/api";
import {
  normaliseInBounds,
  type Bounds,
  type Point3,
} from "../../shared/geometry/stringLayout";

const ORIGIN: Point3 = { x: 0, y: 0, z: 0 };

/** A virtual string's colours, written through to the real strings under it. */
export class VirtualStringLedDataModel implements EffectString {
  constructor(
    public ledData: LedDataStoreModel,
    public virtualString: VirtualStringNodeModel,
  ) {
    makeAutoObservable(this);
  }

  get key() {
    return this.virtualString.key;
  }

  get ledCount() {
    return this.virtualString.ledCount;
  }

  get bounds(): Bounds {
    return this.ledData.project.ledBounds;
  }

  getPosition(index: number): Point3 {
    return this.virtualString.filledPositions[index] ?? ORIGIN;
  }

  getNormalisedPosition(index: number): Point3 {
    return normaliseInBounds(this.getPosition(index), this.bounds);
  }

  get virtualPixels(): VirtualPixelModel[] {
    const pixels: VirtualPixelModel[] = [];

    for (const segment of this.virtualString.segments) {
      const stringLedData = this.ledData.strings.find(
        (s) => s.string.key === segment.nodeId,
      );
      if (!stringLedData) continue;

      if (segment.isReversed)
        for (let i = segment.toIndex; i >= segment.fromIndex; i--)
          pixels.push(new VirtualPixelModel(stringLedData, i));
      else
        for (let i = segment.fromIndex; i <= segment.toIndex; i++)
          pixels.push(new VirtualPixelModel(stringLedData, i));
    }

    return pixels;
  }

  setPixel(index: number, r: number, g: number, b: number) {
    const pixel = this.virtualPixels[index];
    if (pixel) pixel.setColor(r, g, b);
  }

  setAllPixels(r: number, g: number, b: number) {
    for (const pixel of this.virtualPixels) pixel.setColor(r, g, b);
  }

  getPixel(index: number): [number, number, number] {
    const pixel = this.virtualPixels[index];
    if (!pixel) return [0, 0, 0];
    return pixel.getColor();
  }

  clear() {
    for (const pixel of this.virtualPixels) pixel.clear();
  }

  multiplyAll(byValue: number) {
    for (const pixel of this.virtualPixels) pixel.multiply(byValue);
  }
}
