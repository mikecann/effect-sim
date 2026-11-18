import type { NodeKey } from "../../shared/models/docs";
import { makeAutoObservable } from "mobx";
import { StringNodeModel } from "../../shared/models/StringNodeModel";
import type { EffectString } from "../../shared/effects/api";
import {
  normaliseInBounds,
  type Bounds,
  type Point3,
} from "../../shared/geometry/stringLayout";

const ORIGIN: Point3 = { x: 0, y: 0, z: 0 };
const NO_BOUNDS: Bounds = { min: ORIGIN, max: ORIGIN };

/** The colours a string shows, as the effects write them. */
export class StringLedDataModel implements EffectString {
  _data: Uint8Array;
  _allocatedSize: number;

  constructor(public string: StringNodeModel) {
    this._allocatedSize = string.ledCount * 3;
    this._data = new Uint8Array(this._allocatedSize);
    makeAutoObservable<StringLedDataModel, "_data" | "_allocatedSize">(this, {
      _data: false, // Don't make the array observable - it's mutated in place
      _allocatedSize: false,
    });
  }

  get key(): NodeKey {
    return this.string.key;
  }

  get ledCount() {
    return this.string.ledCount;
  }

  get bounds(): Bounds {
    return this.string.project?.ledBounds ?? NO_BOUNDS;
  }

  getPosition(index: number): Point3 {
    return this.string.filledPositions[index] ?? ORIGIN;
  }

  getNormalisedPosition(index: number): Point3 {
    return normaliseInBounds(this.getPosition(index), this.bounds);
  }

  get data(): Uint8Array {
    // Resize if ledCount changed
    const requiredSize = this.ledCount * 3;
    if (requiredSize > this._allocatedSize) {
      const newData = new Uint8Array(requiredSize);
      newData.set(this._data);
      this._data = newData;
      this._allocatedSize = requiredSize;
    }
    return this._data;
  }

  setPixel(index: number, r: number, g: number, b: number) {
    if (index < 0 || index >= this.ledCount) return;

    const base = index * 3;
    const data = this.data;

    if (data[base] !== r || data[base + 1] !== g || data[base + 2] !== b) {
      data[base] = r;
      data[base + 1] = g;
      data[base + 2] = b;
    }
  }

  setAllPixels(r: number, g: number, b: number) {
    const data = this.data;
    for (let i = 0; i < this.ledCount * 3; i += 3) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  getPixel(index: number): [number, number, number] {
    if (index < 0 || index >= this.ledCount) return [0, 0, 0];

    const base = index * 3;
    const data = this.data;
    return [data[base] ?? 0, data[base + 1] ?? 0, data[base + 2] ?? 0];
  }

  clear() {
    this.data.fill(0);
  }

  multiplyAll(byValue: number) {
    const data = this.data;
    const len = this.ledCount * 3;
    for (let i = 0; i < len; i++) data[i] = Math.floor(data[i] * byValue);
  }
}
