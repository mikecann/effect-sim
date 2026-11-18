import { makeAutoObservable } from "mobx";
import type { NodeKey } from "../../../shared/models/docs";
import { AppModel } from "../../common/models/AppModel";
import { StringUIModel } from "./StringUIModel";

export class SimulatorUIModel {
  // Kept by string key, so an edit to one doc doesn't rebuild every string's model.
  private stringModels = new Map<NodeKey, StringUIModel>();

  constructor(
    public readonly app: AppModel,
    public readonly id: string,
  ) {
    makeAutoObservable<SimulatorUIModel, "stringModels">(this, {
      app: false,
      stringModels: false,
    });
  }

  get strings(): StringUIModel[] {
    const strings = this.app.project?.strings ?? [];
    const keys = new Set(strings.map((s) => s.key));
    for (const key of this.stringModels.keys())
      if (!keys.has(key)) this.stringModels.delete(key);

    return strings.map((string) => {
      const existing = this.stringModels.get(string.key);
      if (existing?.string === string) return existing;
      const model = new StringUIModel(string, this);
      this.stringModels.set(string.key, model);
      return model;
    });
  }

  /** The strings drawn as they are: all but the one whose path is being drawn. */
  get stringsNotPlacing(): StringUIModel[] {
    const placing = this.app.placingStringKey;
    return this.strings.filter((s) => s.key !== placing);
  }
}
