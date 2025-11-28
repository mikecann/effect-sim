import { makeAutoObservable } from "mobx";
import type { Segment } from "./types";
import type { Icon } from "./types";
import { ProjectModel } from "./ProjectModel";
import { NodeDocOfKind } from "../../convex/schema";
import { VirtualStringNodeSegmentModel } from "./VirtualStringNodeSegmentModel";

export class VirtualStringNodeModel {
  constructor(
    public doc: NodeDocOfKind<"virtual_string">,
    public readonly project?: ProjectModel,
  ) {
    makeAutoObservable(this, {
      project: false,
    });
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

  get name() {
    return this.doc.name;
  }

  get icon() {
    return this.doc.icon;
  }

  get segments(): VirtualStringNodeSegmentModel[] {
    return this.doc.segments.map(
      (segment, index) =>
        new VirtualStringNodeSegmentModel(segment, this, index),
    );
  }

  get ledCount() {
    return this.doc.segments.reduce(
      (total, segment) => total + (segment.toIndex - segment.fromIndex + 1),
      0,
    );
  }

  setName(name: string) {
    this.doc.name = name;
  }

  setIcon(icon: Icon) {
    this.doc.icon = icon;
  }

  setSegments(segments: Segment[]) {
    this.doc.segments = segments;
  }

  update({
    name,
    icon,
    segments,
  }: {
    name?: string;
    icon?: Icon;
    segments?: Segment[];
  }) {
    const doc = this.doc;
    if (name !== undefined) doc.name = name;
    if (icon !== undefined) doc.icon = icon;
    if (segments !== undefined) doc.segments = segments;
  }

  remove() {
    if (!this.project) return;
    this.project.removeNode(this);
  }
}
