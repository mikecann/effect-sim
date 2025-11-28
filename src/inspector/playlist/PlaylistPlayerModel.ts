import { makeAutoObservable, reaction } from "mobx";
import type { Id } from "../../../convex/_generated/dataModel";
import type { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";
import type { PlaylistModel } from "../../../shared/models/PlaylistModel";
import { SequenceRuntimeModel } from "../../sequencer/runtime/SequenceRuntimeModel";

export class PlaylistPlayerModel {
  isPlaying = false;
  currentSequenceIndex = 0;

  constructor(public readonly playlist: PlaylistModel) {
    makeAutoObservable(this);
  }

  get currentSequenceId(): Id<"sequences"> | null {
    return this.playlist && this.playlist.sequenceIds.length > 0
      ? this.playlist.sequenceIds[this.currentSequenceIndex]
      : null;
  }

  get currentSequence(): SequenceModel | null {
    return this.playlist.sequences.length > 0
      ? this.playlist.sequences[this.currentSequenceIndex]
      : null;
  }

  get runtime() {
    return new SequenceRuntimeModel(this.currentSequence);
  }

  get currentSequenceNumFrames(): number {
    return this.currentSequence?.numFrames ?? 0;
  }

  advanceFrame() {
    if (!this.isPlaying || !this.currentSequence || !this.playlist) return;

    const next = this.runtime.playhead.frame + 1;
    if (next < this.currentSequence.numFrames) {
      this.runtime.playhead.setFrame(next);
      return;
    }

    // Sequence finished, move to next or loop
    const isLastSequence =
      this.currentSequenceIndex >= this.playlist.sequenceIds.length - 1;
    if (isLastSequence) {
      // Loop back to first sequence
      this.currentSequenceIndex = 0;
      this.runtime.playhead.setFrame(0);
      this.runtime.incrementLoopCount();
    } else {
      // Move to next sequence
      this.currentSequenceIndex += 1;
      this.runtime.playhead.setFrame(0);
    }
  }

  play() {
    if (!this.playlist || this.playlist.sequenceIds.length === 0) return;
    this.isPlaying = true;
  }

  pause() {
    this.isPlaying = false;
  }

  reset() {
    this.isPlaying = false;
    this.currentSequenceIndex = 0;
    this.runtime.playhead.setFrame(0);
    this.runtime.resetLoopCount();
  }
}
