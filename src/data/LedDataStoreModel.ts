import type { NodeKey } from "../../shared/models/docs";
import { makeAutoObservable } from "mobx";
import type { ProjectModel } from "../../shared/models/ProjectModel";
import { StringLedDataModel, StringLedDataApi } from "./StringLedDataModel";
import { VirtualStringLedDataModel } from "./VirtualStringLedDataModel";

export type StringsMap = Map<
  NodeKey,
  { data: Uint8Array; ledCount: number }
>;

export class LedDataStoreModel {
  _stringModels = new Map<NodeKey, StringLedDataModel>();
  _virtualModels = new Map<NodeKey, VirtualStringLedDataModel>();

  constructor(public project: ProjectModel) {
    makeAutoObservable<
      LedDataStoreModel,
      "_stringModels" | "_virtualModels"
    >(this, {
      _stringModels: false,
      _virtualModels: false,
    });
  }

  get strings(): StringLedDataModel[] {
    // Sync cached models with current project strings
    const currentIds = new Set(this.project.strings.map((s) => s.key));

    // Remove models for deleted strings
    for (const id of this._stringModels.keys())
      if (!currentIds.has(id)) this._stringModels.delete(id);

    // Create or reuse models for current strings
    return this.project.strings.map((string) => {
      let model = this._stringModels.get(string.key);
      if (!model) {
        model = new StringLedDataModel(string);
        this._stringModels.set(string.key, model);
      }
      return model;
    });
  }

  get stringsMap(): Map<NodeKey, StringLedDataModel> {
    const map = new Map<NodeKey, StringLedDataModel>();
    for (const string of this.strings) map.set(string.string.key, string);
    return map;
  }

  get virtuals(): VirtualStringLedDataModel[] {
    // Sync cached models with current project virtual strings
    const currentIds = new Set(this.project.virtualStrings.map((v) => v.key));

    // Remove models for deleted virtuals
    for (const id of this._virtualModels.keys())
      if (!currentIds.has(id)) this._virtualModels.delete(id);

    // Create or reuse models for current virtual strings
    return this.project.virtualStrings.map((virtualString) => {
      let model = this._virtualModels.get(virtualString.key);
      if (!model) {
        model = new VirtualStringLedDataModel(this, virtualString);
        this._virtualModels.set(virtualString.key, model);
      }
      return model;
    });
  }

  get stringsAndVirtuals(): StringLedDataApi[] {
    return [...this.strings, ...this.virtuals];
  }

  get stringsAndVirtualsMap(): Map<NodeKey, StringLedDataApi> {
    const map = new Map<NodeKey, StringLedDataApi>();
    for (const string of this.strings) map.set(string.string.key, string);

    for (const virtual of this.virtuals)
      map.set(virtual.virtualString.key, virtual);

    return map;
  }
}
