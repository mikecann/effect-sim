import type { SequenceKey } from "../../shared/models/docs";
import { makeAutoObservable, observableRef } from "mobx";
import type { PlaylistModel } from "../../shared/models/PlaylistModel";
import type { SequenceModel } from "../../shared/models/sequencer/SequenceModel";
import { SequenceRuntimeModel } from "../../src/sequencer/runtime/SequenceRuntimeModel";

/** The parts of a playlist the player reads, live from the project. */
export type PlayablePlaylist = Pick<PlaylistModel, "sequences">;

/**
 * Plays a playlist on the real lights, frame by frame, and keeps up with
 * edits while it plays: it reads the playlist's sequences fresh every frame,
 * so sequences added, removed or reordered in the editor (or a playlist that
 * was empty getting its first one) take effect without a mode change. It
 * remembers where it is by sequence key and position, so it carries on from
 * the same sequence when it can and from the same place in the list when
 * that sequence went.
 */
export class HeadlessPlayerModel {
  /** Null when there's nothing to play. */
  runtime: SequenceRuntimeModel | null = null;
  private index = 0;
  private key: SequenceKey | null = null;

  constructor(public playlist: PlayablePlaylist) {
    // By reference: the playlist is the project's own model.
    makeAutoObservable(this, { playlist: observableRef });
  }

  /** The mode's playlist was rebuilt (a sequence mode, or a recreated playlist). */
  setPlaylist(playlist: PlayablePlaylist) {
    this.playlist = playlist;
  }

  advanceFrame() {
    const sequences = this.playlist.sequences;
    if (sequences.length === 0) {
      this.runtime = null;
      this.key = null;
      return;
    }

    const current = this.findCurrent(sequences);
    if (!current) {
      this.start(sequences, Math.min(this.index, sequences.length - 1));
      return;
    }

    const runtime = this.runtime;
    if (!runtime) return this.start(sequences, this.index);
    // The same key, but the project rebuilt the model.
    if (runtime.sequence !== current) runtime.setSequence(current);

    const next = runtime.playhead.frame + 1;
    if (next < current.numFrames) {
      runtime.playhead.setFrame(next);
      return;
    }

    const nextIndex = (this.index + 1) % sequences.length;
    if (sequences[nextIndex] === current) {
      // A playlist of one (or the same sequence twice): loop in place.
      this.index = nextIndex;
      runtime.playhead.setFrame(0);
      runtime.incrementLoopCount();
      return;
    }
    this.start(sequences, nextIndex);
  }

  /** The sequence playing now, if it's still in the playlist. */
  private findCurrent(sequences: SequenceModel[]): SequenceModel | null {
    if (this.key === null) return null;
    if (sequences[this.index]?.key === this.key) return sequences[this.index];
    const moved = sequences.findIndex((s) => s.key === this.key);
    if (moved === -1) return null;
    this.index = moved;
    return sequences[moved];
  }

  private start(sequences: SequenceModel[], index: number) {
    const sequence = sequences[index];
    this.index = index;
    this.key = sequence.key;
    this.runtime = new SequenceRuntimeModel(sequence);
  }
}
