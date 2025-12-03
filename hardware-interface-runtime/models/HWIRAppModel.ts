import { makeAutoObservable } from "mobx";
import { Id } from "../../convex/_generated/dataModel";
import { ProjectModel } from "../../shared/models/ProjectModel";
import { LedDataStoreModel } from "../../src/data/LedDataStoreModel";
import { PlaylistModel } from "../../shared/models/PlaylistModel";
import { StringNodeModel } from "../../shared/models/StringNodeModel";
import { HWStringModel } from "./HWStringModel";

export class HWIRAppModel {
  project: ProjectModel | null = null;

  constructor(
    public readonly startupSettings: {
      projectId: Id<"projects">;
      playlistId: Id<"playlists">;
    },
  ) {
    makeAutoObservable(this);
  }

  get dataStore(): LedDataStoreModel | null {
    if (!this.project) return null;
    return new LedDataStoreModel(this.project);
  }

  get playlist(): PlaylistModel | null {
    if (!this.project) return null;
    return (
      this.project.playlists.find(
        (p) => p._id === this.startupSettings.playlistId,
      ) ?? null
    );
  }

  get strings(): HWStringModel[] {
    if (!this.project) return [];
    return this.project.strings.map((s) => new HWStringModel(this, s));
  }

  get stringsMap(): Map<Id<"nodes">, HWStringModel> {
    return new Map(this.strings.map((s) => [s.string._id, s]));
  }

  setProject(project: ProjectModel) {
    this.project = project;
  }
}
