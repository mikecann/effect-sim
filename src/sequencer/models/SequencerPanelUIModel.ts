import type { SequenceKey } from "../../../shared/models/docs";
import { makeAutoObservable, runInAction } from "mobx";
import type { AppModel } from "../../common/models/AppModel";
import { SequenceUIModel } from "./SequenceUIModel";
import { makePersistable } from "mobx-persist-store";

export class SequencerPanelUIModel {
  selectedSequenceId: SequenceKey | null = null;

  constructor(
    public readonly app: AppModel,
    public readonly id: string,
  ) {
    makeAutoObservable(this);

    makePersistable(this, {
      name: `SequencerPanelUIModel-${id}`,
      properties: ["selectedSequenceId"],
      storage: window.localStorage,
    });
  }

  get sequence() {
    if (!this.selectedSequenceId) return null;
    const sequence = this.app.project?.findSequence(
      this.selectedSequenceId,
    );
    if (!sequence) return null;
    return new SequenceUIModel(this, sequence);
  }

  setSelectedSequenceId(id: SequenceKey | null) {
    this.selectedSequenceId = id;
  }

  selectFirstSequence() {
    if (!this.app.project) return;
    if (this.app.project.sequences.length === 0) return;
    this.selectedSequenceId = this.app.project.sequences[0].key;
  }
}
