import { makeAutoObservable, observableRef } from "mobx";
import type * as THREE from "three";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { NodeKey } from "../../../shared/models/docs";
import { ProjectModel } from "../../../shared/models/ProjectModel";
import { exhaustiveCheck } from "../../../shared/misc";
import { AllNodeModels } from "../../../shared/models/types";
import { VirtualStringNodeModel } from "../../../shared/models/VirtualStringNodeModel";
import { StringNodeModel } from "../../../shared/models/StringNodeModel";
import { SimulatorUIModel } from "../../simulator/models/SimulatorUIModel";
import type { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";
import type { TrackModel } from "../../../shared/models/sequencer/TrackModel";
import type { AllTrackEventModels } from "../../../shared/models/sequencer";
import type { PlaylistModel } from "../../../shared/models/PlaylistModel";
import { HardwareInterfaceRuntimeModel } from "./HardwareInterfaceRuntimeModel";
import { FlexLayoutModel } from "./FlexLayoutModel";
import { makePersistable } from "mobx-persist-store";
import { EditorTokenModel } from "../auth/EditorTokenModel";
import type { ProjectSyncModel } from "./sync/ProjectSyncModel";

export type SelectedEntity =
  | { kind: "node"; node: AllNodeModels }
  | { kind: "nodes"; nodes: Array<AllNodeModels> }
  | {
      kind: "virtual_string";
      node: VirtualStringNodeModel;
      selectedSegmentIndex: number | null;
    }
  | { kind: "event"; event: AllTrackEventModels; sequence: SequenceModel }
  | { kind: "track"; track: TrackModel; sequence: SequenceModel }
  | { kind: "playlist"; playlist: PlaylistModel }
  | null;

export class AppModel {
  currentProjectId: Id<"projects"> | null = null;
  isMeasureMode = false;
  placingStringId: NodeKey | null = null;
  selectedEntity: SelectedEntity = null;
  gardenModel: THREE.Object3D | null = null;
  projects: ProjectModel[] = [];
  hardwareInterfaceRuntime: HardwareInterfaceRuntimeModel;
  layout: FlexLayoutModel;
  editorToken = new EditorTokenModel();
  /** Saves the open project (src/common/models/sync/ProjectSyncer.tsx). */
  sync: ProjectSyncModel | null = null;

  constructor() {
    this.hardwareInterfaceRuntime = new HardwareInterfaceRuntimeModel(this);
    this.layout = new FlexLayoutModel(this);
    makeAutoObservable(this, {
      gardenModel: observableRef,
      sync: observableRef,
    });
    makePersistable(this, {
      name: "AppModel",
      properties: ["currentProjectId"],
      storage: window.localStorage,
    });
  }

  get project(): ProjectModel | null {
    if (!this.currentProjectId) return null;
    return this.projects.find((p) => p._id === this.currentProjectId) ?? null;
  }

  getProject(): ProjectModel {
    const project = this.project;
    if (!project) throw new Error("Project not found");
    return project;
  }

  /** Follows the server's list of projects, keeping each model that's still there. */
  setProjectsFromServer(docs: Doc<"projects">[]) {
    this.projects = docs.map((doc) => {
      const existing = this.projects.find((p) => p._id === doc._id);
      if (!existing) return new ProjectModel(doc);
      // The open project's name and settings are merged by its sync.
      if (existing !== this.project) existing.doc = doc;
      return existing;
    });
  }

  setSync(sync: ProjectSyncModel | null) {
    this.sync = sync;
  }

  get selectedNodeIds(): Array<NodeKey> {
    if (!this.selectedEntity) return [];

    if (this.selectedEntity.kind === "node")
      return [this.selectedEntity.node.key];

    if (this.selectedEntity.kind === "nodes")
      return this.selectedEntity.nodes.map((n) => n.key);

    if (this.selectedEntity.kind === "virtual_string")
      return [this.selectedEntity.node.key];

    if (this.selectedEntity.kind === "event") return [];

    if (this.selectedEntity.kind === "track") return [];

    if (this.selectedEntity.kind === "playlist") return [];

    exhaustiveCheck(this.selectedEntity);
  }

  get seletedNodes(): AllNodeModels[] {
    if (!this.selectedEntity) return [];

    if (this.selectedEntity.kind === "node") return [this.selectedEntity.node];

    if (this.selectedEntity.kind === "nodes") return this.selectedEntity.nodes;

    if (this.selectedEntity.kind === "virtual_string")
      return [this.selectedEntity.node];

    if (this.selectedEntity.kind === "event") return [];

    if (this.selectedEntity.kind === "track") return [];

    if (this.selectedEntity.kind === "playlist") return [];

    exhaustiveCheck(this.selectedEntity);
  }

  get strings(): StringNodeModel[] {
    return this.project?.getNodesByKind("string") ?? [];
  }

  getSelectedSegmentIndex(
    virtualStringNode: VirtualStringNodeModel,
  ): number | null {
    if (
      this.selectedEntity?.kind === "virtual_string" &&
      this.selectedEntity.node.key === virtualStringNode.key
    )
      return this.selectedEntity.selectedSegmentIndex;
    return null;
  }

  setCurrentProjectId(id: Id<"projects"> | null) {
    this.currentProjectId = id;
  }

  setIsMeasureMode(value: boolean) {
    this.isMeasureMode = value;
  }

  setPlacingStringId(id: NodeKey | null) {
    this.placingStringId = id;
  }

  setSelectedEntity(entity: SelectedEntity) {
    this.selectedEntity = entity;
  }

  removeProject(project: ProjectModel) {
    const index = this.projects.indexOf(project);
    if (index >= 0) this.projects.splice(index, 1);
    if (this.currentProjectId === project._id) this.currentProjectId = null;
  }

  startPlacingString(stringId: NodeKey) {
    this.setPlacingStringId(stringId);
    if (this.isMeasureMode) this.setIsMeasureMode(false);
  }

  cancelPlacingString() {
    this.setPlacingStringId(null);
  }

  setGardenModel(obj: THREE.Object3D | null) {
    this.gardenModel = obj;
  }

  clearSelection() {
    this.selectedEntity = null;
  }

  requireCurrentProjectId(): Id<"projects"> {
    if (!this.currentProjectId) throw new Error("No current project selected");
    return this.currentProjectId;
  }
}
