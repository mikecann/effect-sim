import { makeAutoObservable } from "mobx";
import type { PathPoint, Icon } from "./types";
import { ProjectModel } from "./ProjectModel";
import type { NodeDocOfKind } from "./docs";
import { exposeDocFields, WithAutoSetters } from "./modelUtils";

export interface StringNodeModel
  extends WithAutoSetters<NodeDocOfKind<"string">> {}

export class StringNodeModel {
  constructor(
    public doc: NodeDocOfKind<"string">,
    public readonly project: ProjectModel,
  ) {
    makeAutoObservable(this);
    exposeDocFields(this);
  }

  remove() {
    if (!this.project) return;
    this.project.removeNode(this);
  }
}
