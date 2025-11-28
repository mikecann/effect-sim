import { makeAutoObservable } from "mobx";
import type { Id } from "../../convex/_generated/dataModel";
import { LedDataStoreModel } from "./LedDataStoreModel";
import { StringNodeModel } from "../../shared/models/StringNodeModel";

export interface StringLedDataApi {
  _id: Id<"nodes">;
  ledCount: number;
  setPixel(index: number, r: number, g: number, b: number): void;
  setAllPixels(r: number, g: number, b: number): void;
  getPixel(index: number): [number, number, number];
  clear(): void;
  multiplyAll(byValue: number): void;
}

export class StringLedDataModel {
  constructor(
    public ledData: LedDataStoreModel,
    public string: StringNodeModel,
  ) {
    makeAutoObservable(this);
  }

  get _id(): Id<"nodes"> {
    return this.string._id;
  }

  get ledCount() {
    return this.string.ledCount;
  }

  get data() {
    return new Uint8Array(this.ledCount * 3);
  }

  setPixel(index: number, r: number, g: number, b: number) {
    if (index < 0 || index >= this.ledCount) return;

    const base = index * 3;

    if (
      this.data[base] !== r ||
      this.data[base + 1] !== g ||
      this.data[base + 2] !== b
    ) {
      this.data[base] = r;
      this.data[base + 1] = g;
      this.data[base + 2] = b;
    }
  }

  setAllPixels(r: number, g: number, b: number) {
    for (let i = 0; i < this.data.length; i += 3) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
    }
  }

  getPixel(index: number): [number, number, number] {
    if (index < 0 || index >= this.ledCount) return [0, 0, 0];

    const base = index * 3;
    return [
      this.data[base] ?? 0,
      this.data[base + 1] ?? 0,
      this.data[base + 2] ?? 0,
    ];
  }

  clear() {
    this.data.fill(0);
  }

  multiplyAll(byValue: number) {
    for (let i = 0; i < this.data.length; i++)
      this.data[i] = Math.floor(this.data[i] * byValue);
  }
}
