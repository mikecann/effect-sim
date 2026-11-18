import type { NodeKey } from "../../../shared/models/docs";
import { makeAutoObservable } from "mobx";
import type { SwitchNodeModel } from "../../../shared/models/SwitchNodeModel";
import type { StringNodeModel } from "../../../shared/models/StringNodeModel";
import type { VirtualStringNodeModel } from "../../../shared/models/VirtualStringNodeModel";
import { SequenceRuntimeEffectModel } from "./SequenceRuntimeEffectModel";
import { PlayheadModel } from "./PlayheadModel";
import { ProjectModel } from "../../../shared/models/ProjectModel";
import type { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";

export class SequenceRuntimeModel {
  loopCount: number = 0;
  playhead = new PlayheadModel();

  constructor(public sequence: SequenceModel | null) {
    makeAutoObservable(this);
  }

  get project(): ProjectModel | null {
    return this.sequence?.project ?? null;
  }

  setSequence(sequence: SequenceModel | null) {
    this.sequence = sequence;
  }

  activeEffects: SequenceRuntimeEffectModel[] = [];
  private activeEffectsById = new Map<string, SequenceRuntimeEffectModel>();

  updateActiveEffects() {
    if (!this.sequence) {
      if (this.activeEffects.length === 0) return;
      this.activeEffects = [];
      this.activeEffectsById.clear();
      return;
    }

    const currentFrame = this.playhead.frame;
    const newActiveEventIds = new Set<string>();

    // Find which events are currently active
    for (const track of this.sequence.trackModels)
      for (const event of track.events)
        if (currentFrame >= event.startFrame && currentFrame < event.endFrame)
          newActiveEventIds.add(event.id);

    // Check if the set of active events changed
    const currentIds = new Set(this.activeEffectsById.keys());
    const sameSet =
      currentIds.size === newActiveEventIds.size &&
      [...newActiveEventIds].every((id) => currentIds.has(id));

    if (sameSet) return;

    // Rebuild the effects array, reusing existing models where possible
    const newEffects: SequenceRuntimeEffectModel[] = [];
    const newEffectsById = new Map<string, SequenceRuntimeEffectModel>();

    for (const track of this.sequence.trackModels)
      for (const event of track.events) {
        if (!newActiveEventIds.has(event.id)) continue;

        const existing = this.activeEffectsById.get(event.id);
        const effect = existing ?? new SequenceRuntimeEffectModel(this, event);
        newEffects.push(effect);
        newEffectsById.set(event.id, effect);
      }

    this.activeEffects = newEffects;
    this.activeEffectsById = newEffectsById;
  }

  get activeStringEffects(): SequenceRuntimeEffectModel[] {
    return this.activeEffects.filter((e) => e.kind === "string");
  }

  get activeSwitchEffects(): SequenceRuntimeEffectModel[] {
    return this.activeEffects.filter((e) => e.kind === "switch");
  }

  private get allStringNodes(): StringNodeModel[] {
    return (this.project?.getNodesByKind("string") as StringNodeModel[]) ?? [];
  }

  private get allVirtualStringNodes(): VirtualStringNodeModel[] {
    return (
      (this.project?.getNodesByKind(
        "virtual_string",
      ) as VirtualStringNodeModel[]) ?? []
    );
  }

  get allStringNodeIds(): NodeKey[] {
    return [
      ...this.allStringNodes.map((n) => n.key),
      ...this.allVirtualStringNodes.map((n) => n.key),
    ];
  }

  private get allSwitchNodes(): SwitchNodeModel[] {
    return (this.project?.getNodesByKind("switch") as SwitchNodeModel[]) ?? [];
  }

  get allSwitchNodeIds(): NodeKey[] {
    return this.allSwitchNodes.map((n) => n.key);
  }

  get switchNodesMap(): Map<NodeKey, SwitchNodeModel> {
    const map = new Map<NodeKey, SwitchNodeModel>();
    for (const node of this.allSwitchNodes) map.set(node.key, node);
    return map;
  }

  incrementLoopCount() {
    this.loopCount++;
  }

  resetLoopCount() {
    this.loopCount = 0;
  }
}
