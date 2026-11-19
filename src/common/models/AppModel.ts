import { makeAutoObservable, observableRef } from "mobx";
import type * as THREE from "three";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { NodeKey } from "../../../shared/models/docs";
import { ProjectModel } from "../../../shared/models/ProjectModel";
import { exhaustiveCheck } from "../../../shared/misc";
import { AllNodeModels } from "../../../shared/models/types";
import { VirtualStringNodeModel } from "../../../shared/models/VirtualStringNodeModel";
import { StringNodeModel } from "../../../shared/models/StringNodeModel";
import type { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";
import type { TrackModel } from "../../../shared/models/sequencer/TrackModel";
import type { AllTrackEventModels } from "../../../shared/models/sequencer";
import type { PlaylistModel } from "../../../shared/models/PlaylistModel";
import { HardwareInterfaceRuntimeModel } from "./HardwareInterfaceRuntimeModel";
import { FlexLayoutModel } from "./FlexLayoutModel";
import { makePersistable } from "mobx-persist-store";
import { MappingUIModel } from "../../mapping/MappingUIModel";
import type { ProjectSyncModel } from "./sync/ProjectSyncModel";
import {
  moveTool,
  selectTool,
  type EditorTool,
  type PlacingTool,
  type ToolEffect,
  type ToolEvent,
} from "./editorTool";

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
  /** What the simulator's pointer does (src/common/models/editorTool.ts). */
  tool: EditorTool = selectTool;
  selectedEntity: SelectedEntity = null;
  gardenModel: THREE.Object3D | null = null;
  projects: ProjectModel[] = [];
  hardwareInterfaceRuntime: HardwareInterfaceRuntimeModel;
  layout: FlexLayoutModel;
  /** Camera mapping's photo alignment (src/mapping). */
  mapping = new MappingUIModel();
  /** Saves the open project (src/common/models/sync/ProjectSyncer.tsx). */
  sync: ProjectSyncModel | null = null;

  constructor() {
    this.hardwareInterfaceRuntime = new HardwareInterfaceRuntimeModel(this);
    this.layout = new FlexLayoutModel(this);
    makeAutoObservable(this, {
      gardenModel: observableRef,
      sync: observableRef,
      tool: observableRef,
      mapping: false,
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

  get selectedNodes(): AllNodeModels[] {
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

  /** Moves the tool on, and does whatever the move asks for. */
  sendTool(event: ToolEvent) {
    const { tool, effect } = moveTool(this.tool, event);
    this.tool = tool;
    if (effect) this.runToolEffect(effect);
  }

  private runToolEffect(effect: ToolEffect) {
    if (effect.kind === "savePath") {
      this.project
        ?.findString(effect.stringKey)
        ?.setPathPoints(effect.points.map((position) => ({ position })));
      return;
    }
    if (effect.kind === "setSegmentRange") {
      const node = this.project?.findNode(effect.virtualStringKey);
      if (!(node instanceof VirtualStringNodeModel)) return;
      const segment = node.segmentModels[effect.segmentIndex];
      segment?.update({
        nodeId: effect.stringKey,
        fromIndex: effect.fromIndex,
        toIndex: effect.toIndex,
        isReversed: effect.isReversed,
      });
      return;
    }
    exhaustiveCheck(effect);
  }

  get isMeasureMode(): boolean {
    return this.tool.kind === "measure";
  }

  get placingTool(): PlacingTool | null {
    return this.tool.kind === "placing" ? this.tool : null;
  }

  /** The string whose path is being drawn, if any. */
  get placingStringKey(): NodeKey | null {
    return this.placingTool?.stringKey ?? null;
  }

  setSelectedEntity(entity: SelectedEntity) {
    this.selectedEntity = entity;
  }

  removeProject(project: ProjectModel) {
    const index = this.projects.indexOf(project);
    if (index >= 0) this.projects.splice(index, 1);
    if (this.currentProjectId === project._id) this.currentProjectId = null;
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
