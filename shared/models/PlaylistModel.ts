import { makeAutoObservable } from "mobx";
import type { PlaylistDoc, SequenceKey } from "./docs";
import { SequenceModel } from "./sequencer/SequenceModel";
import { ProjectModel } from "./ProjectModel";
import { exposeDocFields, WithAutoSetters } from "./modelUtils";

export interface PlaylistModel extends WithAutoSetters<PlaylistDoc> {}

export class PlaylistModel {
  constructor(
    public doc: PlaylistDoc,
    public readonly project?: ProjectModel,
  ) {
    makeAutoObservable(this);
    exposeDocFields(this);
  }

  get sequences(): SequenceModel[] {
    return this.sequenceIds
      .map((key) => this.project?.findSequence(key))
      .filter((seq): seq is SequenceModel => Boolean(seq));
  }

  get availableSequences(): SequenceModel[] {
    if (!this.project?.sequences) return [];
    return this.project.sequences.filter(
      (seq) => seq.projectId === this.projectId,
    );
  }

  get sequencesNotOnPlaylist(): SequenceModel[] {
    if (!this.project?.sequences) return [];
    return this.project.sequences.filter(
      (seq) =>
        seq.projectId === this.projectId && !this.sequenceIds.includes(seq.key),
    );
  }

  remove() {
    this.project?.removePlaylist(this);
  }

  addSequence(sequenceOrKey: SequenceModel | SequenceKey) {
    const sequenceId =
      typeof sequenceOrKey === "string" ? sequenceOrKey : sequenceOrKey.key;
    this.sequenceIds.push(sequenceId);
  }

  removeSequence(sequenceId: SequenceKey) {
    const index = this.sequenceIds.indexOf(sequenceId);
    if (index >= 0) this.sequenceIds.splice(index, 1);
  }

  removeSequenceByIndex(index: number) {
    if (index >= 0 && index < this.sequenceIds.length)
      this.sequenceIds.splice(index, 1);
  }

  reorderSequences(oldIndex: number, newIndex: number) {
    if (oldIndex === newIndex) return;
    if (oldIndex < 0 || oldIndex >= this.sequenceIds.length) return;
    if (newIndex < 0 || newIndex >= this.sequenceIds.length) return;

    const [movedItem] = this.sequenceIds.splice(oldIndex, 1);
    this.sequenceIds.splice(newIndex, 0, movedItem);
  }
}
