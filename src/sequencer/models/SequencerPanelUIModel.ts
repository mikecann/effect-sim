import { makeAutoObservable, runInAction } from "mobx";
import type { AppModel } from "../../common/models/AppModel";
import type { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";
import { Id } from "../../../convex/_generated/dataModel";
import { SequenceUIModel } from "./SequenceUIModel";
import { iife } from "../../../shared/misc";

export class SequencerPanelUIModel {
  sequence: SequenceUIModel | null = null;

  constructor(
    public readonly app: AppModel,
    public readonly id: string,
  ) {
    makeAutoObservable(this);

    const persistedData = app.persistedData.sequencers?.[id];
    if (persistedData?.selectedSequenceId)
      this.setSelectedSequence(persistedData.selectedSequenceId);
  }

  get selectedSequenceId() {
    return this.sequence?.sequence._id ?? null;
  }

  setSelectedSequence(sequence: Id<"sequences"> | SequenceModel | null) {
    const sequenceModel = iife(() => {
      if (typeof sequence === "string")
        return (
          this.app.project?.sequences.find((s) => s._id === sequence) ?? null
        );

      return sequence;
    });

    if (!sequenceModel) {
      this.sequence = null;
      return;
    }

    runInAction(() => {
      this.sequence = new SequenceUIModel(this, sequenceModel);
    });
  }

  selectFirstSequence() {
    if (!this.app.project) return;
    if (this.app.project.sequences.length === 0) return;
    this.setSelectedSequence(this.app.project.sequences[0]);
  }
}
