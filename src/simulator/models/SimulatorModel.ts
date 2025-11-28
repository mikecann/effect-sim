import { makeAutoObservable } from "mobx";
import { AppModel } from "../../common/models/AppModel";
import { StringUIModel } from "./StringUIModel";

export class SimulatorModel {
  constructor(public readonly app: AppModel) {
    makeAutoObservable(this, {
      app: false,
    });
  }

  get strings(): StringUIModel[] {
    const project = this.app.project;
    if (!project) return [];
    return project.strings.map((s) => new StringUIModel(s, this));
  }

  get placingString(): StringUIModel | null {
    const project = this.app.project;
    if (!project) return null;

    const placingId = this.app.placingStringId;
    if (!placingId) return null;

    const stringNode = project.strings.find((s) => s._id === placingId);
    if (!stringNode) return null;
    
    return new StringUIModel(stringNode, this);
  }

  get stringsNotPlacing(): StringUIModel[] {
    const placingId = this.app.placingStringId;
    return this.strings.filter((s) => s.stringId !== placingId);
  }

  get isMeasureMode(): boolean {
    return this.app.isMeasureMode;
  }
}
