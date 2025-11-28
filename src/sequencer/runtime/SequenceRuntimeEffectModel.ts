import { makeAutoObservable } from "mobx";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AllTrackEventModels } from "../../../shared/models/sequencer";
import type { SequenceRuntimeModel } from "./SequenceRuntimeModel";
import { stringEffectDefinitionsMap } from "../../common/effects/stringEffectDefinitions";
import { switchEffectDefinitionsMap } from "../../common/effects/switchEffectDefinitions";

export class SequenceRuntimeEffectModel {
  constructor(
    public readonly runtime: SequenceRuntimeModel,
    public readonly event: AllTrackEventModels,
  ) {
    makeAutoObservable(this);
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

  get effectId() {
    return this.event.effectDefinitionId;
  }

  get effectDefinition() {
    if (this.kind === "string")
      return stringEffectDefinitionsMap.get(this.effectId);

    return switchEffectDefinitionsMap.get(this.effectId);
  }

  get validatedProps(): Record<string, unknown> {
    const def = this.effectDefinition;
    if (!def) return this.props;

    const defaultProps = def.defaultProps ?? {};
    if (!def.props || !this.props) return { ...defaultProps, ...this.props };

    const parseResult = def.props.safeParse(this.props);
    if (parseResult.success) return { ...defaultProps, ...parseResult.data };

    return { ...defaultProps, ...this.props };
  }

  get component() {
    // The renderers will cast this to the appropriate type
    return this.effectDefinition?.component as unknown;
  }

  get targetNodeIds(): Id<"nodes">[] {
    const nodeIds = this.nodeIds;
    if (nodeIds !== "all") return nodeIds;

    if (this.kind === "string") return this.runtime.allStringNodeIds;

    return this.runtime.allSwitchNodeIds;
  }

  get nodeIds(): Id<"nodes">[] | "all" {
    return this.event.appliesTo.kind === "nodes"
      ? this.event.appliesTo.nodeIds
      : "all";
  }

  get startFrame() {
    return this.event.startFrame;
  }

  get endFrame() {
    return this.event.endFrame;
  }

  get props() {
    return (this.event.props as Record<string, unknown>) ?? {};
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
