import { makeAutoObservable, observable } from "mobx";
import { StringNodeModel } from "../../shared/models/StringNodeModel";
import { HWIRAppModel } from "./HWIRAppModel";
import { Signal } from "../../shared/Signal";

export class HWStringModel {
  readonly onData = new Signal<Uint8Array>();

  constructor(
    public readonly app: HWIRAppModel,
    public readonly string: StringNodeModel,
  ) {
    makeAutoObservable(this, {
      onData: observable.ref,
    });
  }
}
