import { makeAutoObservable } from "mobx";
import { ProjectModel } from "./ProjectModel";
import { NodeDocOfKind } from "../../convex/schema";

export class FolderNodeModel {
  constructor(
    public doc: NodeDocOfKind<"folder">,
    public readonly project?: ProjectModel,
  ) {
    makeAutoObservable(this);
  }

  get _id() {
    return this.doc._id;
  }

  get _creationTime() {
    return this.doc._creationTime;
  }

  get order() {
    return this.doc.order;
  }

  get parentId() {
    return this.doc.parentId;
  }

  get projectId() {
    return this.doc.projectId;
  }

  get kind() {
    return this.doc.kind;
  }

  get label() {
    return this.doc.label;
  }

  get children() {
    return this.doc.children;
  }

  setLabel(label: string) {
    this.doc.label = label;
  }

  update({ label }: { label?: string }) {
    if (label !== undefined) this.doc.label = label;
  }

  remove() {
    if (!this.project) return;
    this.project.removeNode(this);
  }
}
