import { makeAutoObservable } from "mobx";
import { StringNodeModel } from "../../../shared/models/StringNodeModel";
import type { VirtualStringNodeModel } from "../../../shared/models/VirtualStringNodeModel";
import type { SimulatorModel } from "./SimulatorModel";
import { StringUISegmentModel, type Point3D } from "./StringUISegmentModel";

export class StringUIModel {
  constructor(
    public readonly string: StringNodeModel,
    public readonly simulator: SimulatorModel,
  ) {
    makeAutoObservable(this, {
      string: false,
      simulator: false,
    });
  }

  get stringId() {
    return this.string._id;
  }

  get pathPoints(): Point3D[] {
    return this.string.pathPoints.map((p) => p.position);
  }

  get lightsOnTop(): boolean {
    return this.string.project?.settings.lightsOnTop ?? true;
  }

  // Compute segment lengths for LED allocation
  private get segmentLengths(): number[] {
    const points = this.pathPoints;
    const lengths: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      lengths.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    return lengths;
  }

  get totalLength(): number {
    return this.segmentLengths.reduce((a, b) => a + b, 0);
  }

  // Total LEDs we can fit based on spacing and string length
  get totalLedsBySpacing(): number {
    const ledsPerMeter = 1 / this.string.spacingMeters;
    return Math.max(1, Math.round(this.totalLength * ledsPerMeter));
  }

  // Actual LEDs to render (min of configured and spacing-based)
  get totalLedsToRender(): number {
    return Math.min(this.string.ledCount, this.totalLedsBySpacing);
  }

  // Allocate LEDs to each segment proportionally
  private get segmentLedAllocations(): { startIndex: number; count: number }[] {
    const points = this.pathPoints;
    if (points.length < 2) return [];

    const lengths = this.segmentLengths;
    const totalLength = this.totalLength;
    const totalLeds = this.totalLedsToRender;

    const allocations: { startIndex: number; count: number }[] = [];
    let assigned = 0;

    for (let i = 0; i < lengths.length; i++) {
      const proportion = totalLength > 0 ? lengths[i] / totalLength : 0;
      const count =
        i === lengths.length - 1
          ? totalLeds - assigned
          : Math.round(totalLeds * proportion);
      const finalCount = Math.max(1, count);
      allocations.push({ startIndex: assigned, count: finalCount });
      assigned += finalCount;
    }

    // Normalize in case rounding overshot
    while (assigned > totalLeds)
      for (let i = 0; i < allocations.length && assigned > totalLeds; i++)
        if (allocations[i].count > 1) {
          allocations[i].count -= 1;
          assigned -= 1;
        }

    // Recalculate start indices after normalization
    let runningStart = 0;
    for (const alloc of allocations) {
      alloc.startIndex = runningStart;
      runningStart += alloc.count;
    }

    return allocations;
  }

  get segments(): StringUISegmentModel[] {
    const points = this.pathPoints;
    if (points.length < 2) return [];

    const allocations = this.segmentLedAllocations;

    return points.slice(0, -1).map((start, index) => {
      const end = points[index + 1];
      const alloc = allocations[index] ?? { startIndex: 0, count: 1 };
      return new StringUISegmentModel(
        this,
        index,
        start,
        end,
        alloc.startIndex,
        alloc.count,
      );
    });
  }

  // Selection state
  get isSelected(): boolean {
    const selectedNodeIds = this.simulator.app.selectedNodeIds;
    return selectedNodeIds.includes(this.stringId);
  }

  // Virtual string selection info for highlighting specific LEDs
  get ledSelectionInfo(): {
    whiteLedIndices: Set<number>;
    yellowLedIndices: Set<number>;
    isHighlighted: boolean;
  } {
    const whiteLedIndices = new Set<number>();
    const yellowLedIndices = new Set<number>();
    const isHighlighted = false;

    const app = this.simulator.app;
    const selectedEntity = app.selectedEntity;
    if (!selectedEntity)
      return { whiteLedIndices, yellowLedIndices, isHighlighted };

    const project = app.project;
    if (!project) return { whiteLedIndices, yellowLedIndices, isHighlighted };

    const selectedNodes = app.seletedNodes;
    if (selectedNodes.length === 0)
      return { whiteLedIndices, yellowLedIndices, isHighlighted };

    // Check for virtual_string selection with a selected segment
    if (selectedEntity.kind === "virtual_string") {
      const virtualStringNode = selectedEntity.node;
      if (virtualStringNode.kind === "virtual_string")
        virtualStringNode.segments.forEach((segment, segmentIndex) => {
          if (segment.nodeId === this.stringId) {
            const isSelectedSegment =
              selectedEntity.selectedSegmentIndex === segmentIndex;
            const targetSet = isSelectedSegment
              ? yellowLedIndices
              : whiteLedIndices;
            for (let i = segment.fromIndex; i <= segment.toIndex; i++)
              targetSet.add(i);
          }
        });
      return { whiteLedIndices, yellowLedIndices, isHighlighted };
    }

    // Check for regular node/nodes selection
    for (const node of selectedNodes)
      if (node && node.kind === "virtual_string") {
        const virtualStringNode = node as VirtualStringNodeModel;
        for (const segment of virtualStringNode.segments)
          if (segment.nodeId === this.stringId)
            for (let i = segment.fromIndex; i <= segment.toIndex; i++)
              whiteLedIndices.add(i);
      }

    return { whiteLedIndices, yellowLedIndices, isHighlighted };
  }
}
