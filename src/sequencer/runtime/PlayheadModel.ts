import { makeAutoObservable } from "mobx";

export class PlayheadModel {
  /**
   * Goes up each time someone jumps the playhead (scrubbing), as opposed to
   * playing it on, so the runtime starts its effects over
   * (SequenceRuntime.tsx). Players only ever step and loop.
   */
  jumps = 0;

  constructor(public frame: number = 0) {
    makeAutoObservable(this);
  }

  /** Where a player puts the playhead: the next frame, or 0 for a new loop. */
  setFrame(value: number) {
    this.frame = value;
  }

  /** Where someone puts the playhead by hand. One frame on is just a step. */
  jumpTo(value: number) {
    if (value === this.frame) return;
    if (value !== this.frame + 1) this.jumps++;
    this.frame = value;
  }

  stepForwards() {
    this.frame++;
  }

  stepBackwards() {
    this.frame--;
  }
}
