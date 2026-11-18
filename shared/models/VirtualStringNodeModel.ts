import { makeAutoObservable } from "mobx";
import type { Segment, Icon } from "./types";
import { ProjectModel } from "./ProjectModel";
import type { NodeDocOfKind } from "./docs";
import { VirtualStringNodeSegmentModel } from "./VirtualStringNodeSegmentModel";
import { exposeDocFields, WithAutoSetters } from "./modelUtils";

export interface VirtualStringNodeModel
  extends WithAutoSetters<NodeDocOfKind<"virtual_string">> {}

export class VirtualStringNodeModel {
  constructor(
    public doc: NodeDocOfKind<"virtual_string">,
    public readonly project?: ProjectModel,
  ) {
    makeAutoObservable(this, {
      project: false,
    });
    exposeDocFields(this);
  }

  get segmentModels(): VirtualStringNodeSegmentModel[] {
    return this.segments.map(
      (segment, index) =>
        new VirtualStringNodeSegmentModel(segment, this, index),
    );
  }

  get ledCount() {
    return this.segments.reduce(
      (total, segment) => total + (segment.toIndex - segment.fromIndex + 1),
      0,
    );
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
    if (name !== undefined) this.setName(name);
    if (icon !== undefined) this.setIcon(icon);
    if (segments !== undefined) this.setSegments(segments);
  }

  remove() {
    if (!this.project) return;
    this.project.removeNode(this);
  }
}
