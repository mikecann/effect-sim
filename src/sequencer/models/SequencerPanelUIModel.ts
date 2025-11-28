import { makeAutoObservable, runInAction } from "mobx";
import type { AppModel } from "../../common/models/AppModel";
import type { SequenceModel } from "../../../shared/models/sequencer/SequenceModel";
import { Id } from "../../../convex/_generated/dataModel";
import { SequenceUIModel } from "./SequenceUIModel";
import { iife } from "../../../shared/misc";
import { z } from "zod";
import { PersistableModel } from "../../common/persistence/ModelPersister";

export const SequencerPanelPersistableDataSchema = z.object({
  selectedSequenceId: z
    .string()
    .nullable()
    .transform((val) => val as Id<"sequences"> | null),
});

export type SequencerPanelPersistableData = z.infer<
  typeof SequencerPanelPersistableDataSchema
>;

export class SequencerPanelUIModel
  implements PersistableModel<SequencerPanelPersistableData>
{
  sequence: SequenceUIModel | null = null;

  constructor(public readonly app: AppModel) {
    makeAutoObservable(this);
  }

  get persistenceKey(): string {
    return "sequencer-panel-persistence-v1";
  }

  get persistenceSchema() {
    return SequencerPanelPersistableDataSchema;
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

  get persistableData(): SequencerPanelPersistableData {
    return {
      selectedSequenceId: this.sequence?.sequence._id ?? null,
    };
  }

  restoreFromPersistableData(data: SequencerPanelPersistableData): void {
    this.setSelectedSequence(data.selectedSequenceId);
  }
}
