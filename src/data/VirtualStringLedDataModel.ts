import { makeAutoObservable } from "mobx";
import { VirtualStringNodeModel } from "../../shared/models/VirtualStringNodeModel";
import { LedDataStoreModel } from "./LedDataStoreModel";
import { VirtualPixelModel } from "./VirtualPixelModel";

export class VirtualStringLedDataModel {
  constructor(
    public ledData: LedDataStoreModel,
    public virtualString: VirtualStringNodeModel,
  ) {
    makeAutoObservable(this);
  }

  get _id() {
    return this.virtualString._id;
  }

  get ledCount() {
    return this.virtualString.ledCount;
  }

  get virtualPixels(): VirtualPixelModel[] {
    const pixels: VirtualPixelModel[] = [];

    for (const segment of this.virtualString.segments) {
      const stringLedData = this.ledData.strings.find(
        (s) => s.string._id === segment.nodeId,
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
