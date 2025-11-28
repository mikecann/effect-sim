import { makeAutoObservable } from "mobx";
import { StringLedDataModel } from "./StringLedDataModel";

export class VirtualPixelModel {
  constructor(
    public stringLedData: StringLedDataModel,
    public physicalIndex: number,
  ) {
    makeAutoObservable(this);
  }

  setColor(r: number, g: number, b: number) {
    this.stringLedData.setPixel(this.physicalIndex, r, g, b);
  }

  getColor(): [number, number, number] {
    return this.stringLedData.getPixel(this.physicalIndex);
  }

  clear() {
    this.stringLedData.setPixel(this.physicalIndex, 0, 0, 0);
  }

  multiply(byValue: number) {
    const [r, g, b] = this.getColor();
    this.setColor(
      Math.floor(r * byValue),
      Math.floor(g * byValue),
      Math.floor(b * byValue),
    );
  }
}
