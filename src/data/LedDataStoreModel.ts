import { makeAutoObservable } from "mobx";
import type { Id } from "../../convex/_generated/dataModel";
import type { ProjectModel } from "../../shared/models/ProjectModel";
import { StringLedDataModel, StringLedDataApi } from "./StringLedDataModel";
import { VirtualStringLedDataModel } from "./VirtualStringLedDataModel";

export type StringsMap = Map<
  Id<"nodes">,
  { data: Uint8Array; ledCount: number }
>;

export class LedDataStoreModel {
  constructor(public project: ProjectModel) {
    makeAutoObservable(this);
  }

  get strings() {
    return this.project.strings.map(
      (string) => new StringLedDataModel(this, string),
    );
  }

  get stringsMap(): Map<Id<"nodes">, StringLedDataModel> {
    const map = new Map<Id<"nodes">, StringLedDataModel>();
    for (const string of this.strings) map.set(string.string._id, string);
    return map;
  }

  get virtuals() {
    return this.project.virtualStrings.map(
      (virtualString) => new VirtualStringLedDataModel(this, virtualString),
    );
  }

  get stringsAndVirtuals(): StringLedDataApi[] {
    return [...this.strings, ...this.virtuals];
  }

  get stringsAndVirtualsMap(): Map<Id<"nodes">, StringLedDataApi> {
    const map = new Map<Id<"nodes">, StringLedDataApi>();
    for (const string of this.strings) map.set(string.string._id, string);

    for (const virtual of this.virtuals)
      map.set(virtual.virtualString._id, virtual);

    return map;
  }
}
