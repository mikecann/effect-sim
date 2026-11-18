import { makeAutoObservable } from "mobx";
import type { PathPoint, Icon } from "./types";
import { ProjectModel } from "./ProjectModel";
import type { NodeDocOfKind } from "./docs";
import { exposeDocFields, WithAutoSetters } from "./modelUtils";
import {
  fillMissingPositions,
  layoutString,
  type Point3,
  type StringLayout,
} from "../geometry/stringLayout";

export interface StringNodeModel extends WithAutoSetters<
  NodeDocOfKind<"string">
> {}

export class StringNodeModel {
  constructor(
    public doc: NodeDocOfKind<"string">,
    public readonly project: ProjectModel,
  ) {
    makeAutoObservable(this);
    exposeDocFields(this);
  }

  /** Where each LED is (shared/geometry/stringLayout.ts). */
  get layout(): StringLayout {
    return layoutString(this.doc);
  }

  /** True when the LED positions came from camera mapping. */
  get isMapped(): boolean {
    return (this.doc.ledPositions?.length ?? 0) > 0;
  }

  /** Every LED's position, with gaps filled from their neighbours, for effects. */
  get filledPositions(): Array<Point3 | null> {
    return fillMissingPositions(this.layout.positions);
  }

  remove() {
    if (!this.project) return;
    this.project.removeNode(this);
  }
}
