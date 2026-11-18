import { makeAutoObservable } from "mobx";
import { ProjectModel } from "./ProjectModel";
import type { NodeDocOfKind } from "./docs";
import { exposeDocFields, WithAutoSetters } from "./modelUtils";

export interface FolderNodeModel
  extends WithAutoSetters<NodeDocOfKind<"folder">> {}

export class FolderNodeModel {
  constructor(
    public doc: NodeDocOfKind<"folder">,
    public readonly project?: ProjectModel,
  ) {
    makeAutoObservable(this);
    exposeDocFields(this);
  }

  update({ label }: { label?: string }) {
    if (label !== undefined) this.setLabel(label);
  }

  remove() {
    if (!this.project) return;
    this.project.removeNode(this);
  }
}
