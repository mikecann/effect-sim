import { makeAutoObservable } from "mobx";
import type { SequenceUIModel } from "./SequenceUIModel";
import { ROW_HEIGHT } from "../sequencer";
import type { AllTrackEventModels } from "../../../shared/models/sequencer";

export class GhostTrackUIModel {
  constructor(
    public readonly sequenceUI: SequenceUIModel,
    public readonly index: number, // 0-based from last track
  ) {
    makeAutoObservable(this);
  }

  get y() {
    return (this.sequenceUI.sequence.tracks.length + this.index) * ROW_HEIGHT;
  }

  get frameWidth() {
    return this.sequenceUI.frameWidth;
  }

  get sequenceNumFrames() {
    return this.sequenceUI.sequenceNumFrames;
  }

  get isTarget() {
    return (
      this.sequenceUI.dragPreview?.ghostTrackIndex === this.index &&
      this.sequenceUI.dragPreview !== null
    );
  }

  get draggedEvent(): AllTrackEventModels | null {
    const preview = this.sequenceUI.dragPreview;
    if (!preview || !this.isTarget) return null;

    const track = this.sequenceUI.sequence.tracks.find(
      (t) => t.id === preview.sourceTrackId,
    );
    return track?.events.find((e) => e.id === preview.eventId) ?? null;
  }

  get dragPreview() {
    return this.sequenceUI.dragPreview;
  }
}

