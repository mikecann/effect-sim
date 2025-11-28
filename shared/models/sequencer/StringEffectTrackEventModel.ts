import { makeAutoObservable } from "mobx";
import { Id } from "../../../convex/_generated/dataModel";
import type { TrackEvent } from "../../../convex/schema";
import type { TrackModel } from "./TrackModel";

export class StringEffectTrackEventModel {
  constructor(
    public data: Extract<TrackEvent, { kind: "string_effect" }>,
    public readonly track: TrackModel,
  ) {
    makeAutoObservable(this);
  }

  get id() {
    return this.data.id;
  }

  get startFrame() {
    return this.data.startFrame;
  }

  get endFrame() {
    return this.data.endFrame;
  }

  get kind(): "string_effect" {
    return this.data.kind;
  }

  get effectDefinitionId() {
    return this.data.effectDefinitionId;
  }

  get appliesTo() {
    return this.data.appliesTo;
  }

  get props() {
    return this.data.props;
  }

  setStartFrame(startFrame: number) {
    this.data.startFrame = startFrame;
  }

  setEndFrame(endFrame: number) {
    this.data.endFrame = endFrame;
  }

  setEffectDefinitionId(effectDefinitionId: string) {
    this.data.effectDefinitionId = effectDefinitionId;
  }

  setAppliesTo(
    appliesTo:
      | { kind: "nodes"; nodeIds: Array<Id<"nodes">> }
      | { kind: "all_nodes" },
  ) {
    this.data.appliesTo = appliesTo;
  }

  setProps(props: unknown) {
    this.data.props = props;
  }

  remove() {
    this.track.removeEvent(this.id);
  }
}

