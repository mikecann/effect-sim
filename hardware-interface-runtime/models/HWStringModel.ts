import { makeAutoObservable } from "mobx";
import { StringNodeModel } from "../../shared/models/StringNodeModel";
import { HWIRAppModel } from "./HWIRAppModel";
import { Signal } from "../../shared/Signal";
import { WLED_DDPModel } from "./WLED_DDPModel";

export class HWStringModel {
  readonly onData = new Signal<Uint8Array>();
  client: WLED_DDPModel | null = null;

  constructor(
    public readonly app: HWIRAppModel,
    public readonly string: StringNodeModel,
  ) {
    makeAutoObservable(this, {
      onData: false,
    });
  }

  setClient(client: WLED_DDPModel) {
    this.client = client;
  }
}
