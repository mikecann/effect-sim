import type { NodeKey, PlaylistKey } from "../../shared/models/docs";
import { makeAutoObservable } from "mobx";
import { Id } from "../../convex/_generated/dataModel";
import { ProjectModel } from "../../shared/models/ProjectModel";
import { LedDataStoreModel } from "../../src/data/LedDataStoreModel";
import { PlaylistModel } from "../../shared/models/PlaylistModel";
import { StringNodeModel } from "../../shared/models/StringNodeModel";
import { HWStringModel } from "./HWStringModel";
import type { DisplaySettings } from "../../convex/schema";
import type { Infer } from "convex/values";
import type { stringConnectionValidator } from "../../convex/schema";

/** How a string's UDP connection is doing (sent in the heartbeat, convex/hwir.ts). */
export type StringConnection = Infer<typeof stringConnectionValidator>;

export class HWIRAppModel {
  project: ProjectModel | null = null;

  // What the phone remote asked for (convex/display.ts). Null until it loads,
  // or if the remote has never been used: then HWIR plays its startup playlist.
  control: DisplaySettings | null = null;

  // Each string's connection, by node key. Kept here rather than on
  // HWStringModel, which is rebuilt whenever the project's strings change.
  connections = new Map<NodeKey, StringConnection>();

  constructor(
    public readonly startupSettings: {
      projectId: Id<"projects">;
      playlistId: PlaylistKey | null;
    },
  ) {
    makeAutoObservable(this);
  }

  get dataStore(): LedDataStoreModel | null {
    if (!this.project) return null;
    return new LedDataStoreModel(this.project);
  }

  /** Playing a playlist (not listening to the editor). The remote only works then. */
  get isPlaylistMode(): boolean {
    return this.startupSettings.playlistId !== null;
  }

  get isOn(): boolean {
    return this.control?.isOn ?? true;
  }

  /**
   * The editor is camera mapping (convex/mappingSession.ts). Until HWIR lights
   * the session's patterns (Phase 3 of docs/rebuild-plan.md), it shows black.
   */
  get isMapping(): boolean {
    return this.control?.mode.kind === "mapping";
  }

  get brightness(): number {
    return this.control?.brightness ?? 1;
  }

  /** Changes whenever the player should start over with a different mode. */
  get modeKey(): string {
    const mode = this.control?.mode;
    return mode
      ? `${mode.kind}:${mode.id}`
      : `startup:${this.startupSettings.playlistId}`;
  }

  get playlist(): PlaylistModel | null {
    if (!this.project) return null;
    const mode = this.control?.mode;
    if (mode?.kind === "mapping") return null;

    // A single sequence plays as a playlist of one, so it loops.
    if (mode?.kind === "sequence") {
      const sequence = this.project.sequences.find((s) => s.key === mode.id);
      if (!sequence) return null;
      return new PlaylistModel(
        {
          key: `sequence:${mode.id}`,
          name: sequence.name,
          sequenceIds: [mode.id],
          projectId: this.project._id,
        },
        this.project,
      );
    }

    const playlistId =
      mode?.kind === "playlist" ? mode.id : this.startupSettings.playlistId;
    return this.project.playlists.find((p) => p.key === playlistId) ?? null;
  }

  setControl(control: DisplaySettings | null) {
    this.control = control;
  }

  get strings(): HWStringModel[] {
    if (!this.project) return [];
    return this.project.strings.map((s) => new HWStringModel(this, s));
  }

  get stringsMap(): Map<NodeKey, HWStringModel> {
    return new Map(this.strings.map((s) => [s.string.key, s]));
  }

  setConnection(key: NodeKey, connection: StringConnection) {
    this.connections.set(key, connection);
  }

  setProject(project: ProjectModel) {
    this.project = project;
  }
}
