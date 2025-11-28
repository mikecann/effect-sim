import { makeAutoObservable, observable } from "mobx";
import type * as THREE from "three";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { ProjectModel } from "../../../shared/models/ProjectModel";
import { exhaustiveCheck } from "../../../shared/misc";
import { AllNodeModels } from "../../../shared/models/types";
import { VirtualStringNodeModel } from "../../../shared/models/VirtualStringNodeModel";
import { StringNodeModel } from "../../../shared/models/StringNodeModel";
import { SimulatorModel } from "../../simulator/models/SimulatorModel";
import type { SequencerPanelUIModel } from "../../sequencer/models/SequencerPanelUIModel";
import type { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";
import type { TrackModel } from "../../../shared/models/sequencer/TrackModel";
import type { AllTrackEventModels } from "../../../shared/models/sequencer";
import type { PlaylistModel } from "../../../shared/models/PlaylistModel";
import { HardwareInterfaceRuntimeModel } from "./HardwareInterfaceRuntimeModel";
import { z } from "zod";
import { PersistableModel } from "../persistence/ModelPersister";

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

export const AppPersistableDataSchema = z.object({
  currentProjectId: z
    .string()
    .nullable()
    .transform((val) => val as Id<"projects"> | null),
  isMeasureMode: z.boolean(),
  placingStringId: z
    .string()
    .nullable()
    .transform((val) => val as Id<"nodes"> | null),
  hardwareInterfaceRuntime: z
    .object({
      autoconnect: z.boolean().optional(),
    })
    .optional(),
});

export type AppPersistableData = z.infer<typeof AppPersistableDataSchema>;

export class AppModel implements PersistableModel<AppPersistableData> {
  currentProjectId: Id<"projects"> | null = null;
  isMeasureMode = false;
  placingStringId: Id<"nodes"> | null = null;
  selectedEntity: SelectedEntity = null;
  simulators: SimulatorModel[] = [];
  sequencers: SequencerPanelUIModel[] = [];
  gardenModel: THREE.Object3D | null = null;
  projects: ProjectModel[] = [];
  hardwareInterfaceRuntime = new HardwareInterfaceRuntimeModel();

  constructor() {
    makeAutoObservable(this, {
      gardenModel: observable.ref,
    });
  }

  get persistenceKey(): string {
    return "app-model-persistence-v1";
  }

  get persistenceSchema() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return AppPersistableDataSchema as any;
  }

  addSimulator(simulator: SimulatorModel) {
    this.simulators.push(simulator);
  }

  removeSimulator(simulator: SimulatorModel) {
    const index = this.simulators.indexOf(simulator);
    if (index !== -1) this.simulators.splice(index, 1);
  }

  addSequencer(sequencer: SequencerPanelUIModel) {
    this.sequencers.push(sequencer);
  }

  removeSequencer(sequencer: SequencerPanelUIModel) {
    const index = this.sequencers.indexOf(sequencer);
    if (index !== -1) this.sequencers.splice(index, 1);
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

  updateFromServerData({ projects }: { projects: Doc<"projects">[] }) {
    this.projects = projects.map((project) => new ProjectModel(project));
  }

  get selectedNodeIds(): Array<Id<"nodes">> {
    if (!this.selectedEntity) return [];

    if (this.selectedEntity.kind === "node")
      return [this.selectedEntity.node._id];

    if (this.selectedEntity.kind === "nodes")
      return this.selectedEntity.nodes.map((n) => n._id);

    if (this.selectedEntity.kind === "virtual_string")
      return [this.selectedEntity.node._id];

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
      this.selectedEntity.node._id === virtualStringNode._id
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

  setPlacingStringId(id: Id<"nodes"> | null) {
    this.placingStringId = id;
  }

  setSelectedEntity(entity: SelectedEntity) {
    this.selectedEntity = entity;
  }

  addProject(project: ProjectModel) {
    this.projects.push(project);
  }

  startPlacingString(stringId: Id<"nodes">) {
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

  get persistableData(): AppPersistableData {
    return {
      currentProjectId: this.currentProjectId,
      isMeasureMode: this.isMeasureMode,
      placingStringId: this.placingStringId,
      hardwareInterfaceRuntime: {
        autoconnect: this.hardwareInterfaceRuntime.autoconnect,
      },
    };
  }

  restoreFromPersistableData(data: AppPersistableData) {
    this.currentProjectId = data.currentProjectId;
    this.isMeasureMode = data.isMeasureMode;
    this.placingStringId = data.placingStringId;
    if (data.hardwareInterfaceRuntime?.autoconnect !== undefined)
      this.hardwareInterfaceRuntime.setAutoconnect(
        data.hardwareInterfaceRuntime.autoconnect,
      );
  }
}
