import { makeAutoObservable } from "mobx";
import type { Segment } from "./types";
import type { VirtualStringNodeModel } from "./VirtualStringNodeModel";
import type { Id } from "../../convex/_generated/dataModel";
import type { AppModel } from "../../src/common/models/AppModel";

export class VirtualStringNodeSegmentModel {
  constructor(
    public segment: Segment,
    public readonly virtualStringNode: VirtualStringNodeModel,
    public readonly segmentIndex: number,
  ) {
    makeAutoObservable(this, {
      virtualStringNode: false,
    });
  }

  get nodeId() {
    return this.segment.nodeId;
  }

  get fromIndex() {
    return this.segment.fromIndex;
  }

  get toIndex() {
    return this.segment.toIndex;
  }

  get isReversed() {
    return this.segment.isReversed;
  }

  get stringOptions() {
    if (!this.virtualStringNode.project) return [];
    return this.virtualStringNode.project.stringDocs.map((str) => ({
      value: str._id,
      label: str.name,
    }));
  }

  get selectedString() {
    if (!this.virtualStringNode.project) return null;
    return (
      this.virtualStringNode.project.stringDocs.find(
        (str) => str._id === this.segment.nodeId,
      ) ?? null
    );
  }

  get maxIndex() {
    return this.selectedString ? this.selectedString.ledCount - 1 : undefined;
  }

  isSelected(appModel: AppModel): boolean {
    return (
      appModel.getSelectedSegmentIndex(this.virtualStringNode) ===
      this.segmentIndex
    );
  }

  setSelected(appModel: AppModel, index: number | null) {
    appModel.setSelectedEntity({
      kind: "virtual_string",
      node: this.virtualStringNode,
      selectedSegmentIndex: index,
    });
  }

  update(updatedSegment: Segment) {
    const segments = this.virtualStringNode.doc.segments;
    const newSegments = [...segments];
    newSegments[this.segmentIndex] = updatedSegment;
    this.virtualStringNode.setSegments(newSegments);
  }

  remove() {
    const segments = this.virtualStringNode.doc.segments;
    const newSegments = segments.filter((_, i) => i !== this.segmentIndex);
    this.virtualStringNode.setSegments(newSegments);
  }

  updateNodeId(nodeId: Id<"nodes">) {
    this.update({
      ...this.segment,
      nodeId,
    });
  }

  updateRange(fromIndex: number, toIndex: number) {
    this.update({
      ...this.segment,
      fromIndex,
      toIndex,
    });
  }

  toggleReversed() {
    this.update({
      ...this.segment,
      isReversed: !this.segment.isReversed,
    });
  }
}
