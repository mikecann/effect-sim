import type { NodeKey } from "../../../shared/models/docs";
import { makeAutoObservable } from "mobx";
import type { AllTrackEventModels } from "../../../shared/models/sequencer";
import type { SequenceRuntimeModel } from "./SequenceRuntimeModel";
import type { EffectTiming } from "../../../shared/effects/api";
import {
  findStringEffect,
  findSwitchEffect,
} from "../../../shared/effects/registry";
import { hashSeed } from "../../../shared/random";

/** One event while the playhead is inside it. */
export class SequenceRuntimeEffectModel implements EffectTiming {
  constructor(
    public readonly runtime: SequenceRuntimeModel,
    public readonly event: AllTrackEventModels,
  ) {
    makeAutoObservable(this, { runtime: false, event: false });
  }

  /** From the event's id, so it plays the same every time. */
  get seed() {
    return hashSeed(this.event.id);
  }

  get trackId() {
    return this.event.track.id;
  }

  get kind(): "string" | "switch" {
    return this.event.kind === "string_effect" ? "string" : "switch";
  }

  get eventId() {
    return this.event.id;
  }

  get stringEffect() {
    return this.kind === "string"
      ? findStringEffect(this.event.effectDefinitionId)
      : null;
  }

  get switchEffect() {
    return this.kind === "switch"
      ? findSwitchEffect(this.event.effectDefinitionId)
      : null;
  }

  /** The props as the event saved them; each effect checks its own. */
  get rawProps(): unknown {
    return this.event.props;
  }

  get targetNodeIds(): NodeKey[] {
    if (this.event.appliesTo.kind === "nodes")
      return this.event.appliesTo.nodeIds;
    return this.kind === "string"
      ? this.runtime.allStringNodeIds
      : this.runtime.allSwitchNodeIds;
  }

  get startFrame() {
    return this.event.startFrame;
  }

  get endFrame() {
    return this.event.endFrame;
  }

  get effectFrame() {
    return Math.max(0, this.runtime.playhead.frame - this.startFrame);
  }

  get duration() {
    return this.endFrame - this.startFrame;
  }

  get effectPlaybackRatio() {
    const d = this.duration;
    if (d <= 0) return 0;
    return Math.min(1, Math.max(0, this.effectFrame / d));
  }

  get loopCount() {
    return this.runtime.loopCount;
  }
}
