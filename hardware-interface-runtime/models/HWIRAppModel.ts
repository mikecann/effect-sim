import type { NodeKey, PlaylistKey } from "../../shared/models/docs";
import { makeAutoObservable } from "mobx";
import { Id } from "../../convex/_generated/dataModel";
import { ProjectModel } from "../../shared/models/ProjectModel";
import { LedDataStoreModel } from "../../src/data/LedDataStoreModel";
import { PlaylistModel } from "../../shared/models/PlaylistModel";
import type { StringNodeModel } from "../../shared/models/StringNodeModel";
import type { DisplaySettings } from "../../convex/schema";
import type { StringLink } from "../strings/StringLink";
import { FpsMeter } from "../frames/FrameClock";
import type { PlugStatus } from "../display/plug";

export class HWIRAppModel {
  project: ProjectModel | null = null;

  // What the phone remote asked for (convex/display.ts). Null until it loads,
  // or if the remote has never been used: then HWIR plays its startup playlist.
  control: DisplaySettings | null = null;

  /** Each string's WLED link, by node key (String.tsx makes and closes them). */
  readonly links = new Map<NodeKey, StringLink>();

  /** Frames really run per second, for the heartbeat. */
  readonly fpsMeter = new FpsMeter();

  /** How the display's plug is doing (display/plug.ts), for the heartbeat. */
  plugStatus: () => PlugStatus | null = () => null;

  /** The project's nodes, sequences and playlists have arrived from Convex. */
  dataLoaded = false;

  constructor(
    public readonly startupSettings: {
      projectId: Id<"projects">;
      playlistId: PlaylistKey | null;
    },
  ) {
    makeAutoObservable(this, {
      links: false,
      fpsMeter: false,
      plugStatus: false,
    });
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

  /** The editor's camera mapping session the lights show (convex/mapping.ts), or null. */
  get mappingSessionId(): Id<"mappingSessions"> | null {
    const mode = this.control?.mode;
    return mode?.kind === "mapping" ? mode.id : null;
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

  get strings(): StringNodeModel[] {
    return this.project?.strings ?? [];
  }

  setPlugStatus(read: () => PlugStatus | null) {
    this.plugStatus = read;
  }

  setDataLoaded() {
    this.dataLoaded = true;
  }

  setProject(project: ProjectModel) {
    this.project = project;
  }
}
