import type { Id } from "../../../convex/_generated/dataModel";
import type { NodeKey } from "../../../shared/models/docs";
import type { Point3 } from "../../../shared/geometry/stringLayout";
import type { ImagePoint } from "../../mapping/solvePose";

// What the simulator's pointer does: the editor's tool, and every move
// between tools, in one place. AppModel holds the current tool and runs the
// effects a move asks for (saving a placed path, setting a segment's range).

/** Drawing a string's path on the house, point by point. */
export type PlacingTool = {
  kind: "placing";
  stringKey: NodeKey;
  points: Point3[];
  /** Esc was pressed with points down: asking before throwing them away. */
  confirmingDiscard: boolean;
};

/** Lining a mapping session's photo up with the house. */
export type MappingStep =
  /** The photo over the view; the camera moves freely (manual alignment). */
  | { kind: "view" }
  /** The next click picks a point on the photo. */
  | { kind: "pickPhoto" }
  /** The next click picks the same point on the house. */
  | { kind: "pickMesh"; image: ImagePoint };

export type PointPair = { image: ImagePoint; world: Point3 };

export type MappingTool = {
  kind: "mapping";
  sessionKey: Id<"mappingSessions">;
  step: MappingStep;
  /** Points picked on the photo and the same points on the house. */
  pairs: PointPair[];
};

/** Setting a virtual string segment's range by clicking its first and last LEDs. */
export type PickingRangeTool = {
  kind: "pickingRange";
  virtualStringKey: NodeKey;
  segmentIndex: number;
  first: { stringKey: NodeKey; index: number } | null;
};

export type EditorTool =
  | { kind: "select" }
  | { kind: "measure" }
  | PlacingTool
  | MappingTool
  | PickingRangeTool;

export type ToolEvent =
  /** Back to selecting, dropping whatever the tool had. */
  | { kind: "SELECT" }
  | { kind: "TOGGLE_MEASURE" }
  | { kind: "START_PLACING"; stringKey: NodeKey }
  | { kind: "ADD_POINT"; point: Point3 }
  | { kind: "UNDO_POINT" }
  /** Esc while placing. */
  | { kind: "CANCEL_PLACING" }
  | { kind: "KEEP_PLACING" }
  | { kind: "DISCARD_PLACING" }
  /** Enter, or the path used the string's whole length. */
  | { kind: "FINISH_PLACING" }
  | { kind: "START_MAPPING"; sessionKey: Id<"mappingSessions"> }
  | { kind: "PICK_PAIRS" }
  | { kind: "STOP_PICKING" }
  | { kind: "PHOTO_POINT"; image: ImagePoint }
  | { kind: "MESH_POINT"; world: Point3 }
  | { kind: "REMOVE_PAIR"; index: number }
  | { kind: "CLEAR_PAIRS" }
  | {
      kind: "START_PICKING_RANGE";
      virtualStringKey: NodeKey;
      segmentIndex: number;
    }
  | { kind: "PICK_LED"; stringKey: NodeKey; index: number };

/** Something a move asks the app to do. */
export type ToolEffect =
  | { kind: "savePath"; stringKey: NodeKey; points: Point3[] }
  | {
      kind: "setSegmentRange";
      virtualStringKey: NodeKey;
      segmentIndex: number;
      stringKey: NodeKey;
      fromIndex: number;
      toIndex: number;
      isReversed: boolean;
    };

export type ToolMove = { tool: EditorTool; effect: ToolEffect | null };

export const selectTool: EditorTool = { kind: "select" };

const to = (tool: EditorTool): ToolMove => ({ tool, effect: null });

const movePlacing = (tool: PlacingTool, event: ToolEvent): ToolMove => {
  if (event.kind === "ADD_POINT")
    return to({
      ...tool,
      points: [...tool.points, event.point],
      confirmingDiscard: false,
    });
  if (event.kind === "UNDO_POINT")
    return to({
      ...tool,
      points: tool.points.slice(0, -1),
      confirmingDiscard: false,
    });
  if (event.kind === "CANCEL_PLACING")
    return tool.points.length === 0 || tool.confirmingDiscard
      ? to(selectTool)
      : to({ ...tool, confirmingDiscard: true });
  if (event.kind === "KEEP_PLACING")
    return to({ ...tool, confirmingDiscard: false });
  if (event.kind === "DISCARD_PLACING") return to(selectTool);
  if (event.kind === "FINISH_PLACING")
    return tool.points.length < 2
      ? to(tool)
      : {
          tool: selectTool,
          effect: {
            kind: "savePath",
            stringKey: tool.stringKey,
            points: tool.points,
          },
        };
  return to(tool);
};

const moveMapping = (tool: MappingTool, event: ToolEvent): ToolMove => {
  if (event.kind === "PICK_PAIRS")
    return to({ ...tool, step: { kind: "pickPhoto" } });
  if (event.kind === "STOP_PICKING")
    return to({ ...tool, step: { kind: "view" } });
  if (event.kind === "PHOTO_POINT" && tool.step.kind === "pickPhoto")
    return to({ ...tool, step: { kind: "pickMesh", image: event.image } });
  if (event.kind === "MESH_POINT" && tool.step.kind === "pickMesh")
    return to({
      ...tool,
      step: { kind: "pickPhoto" },
      pairs: [...tool.pairs, { image: tool.step.image, world: event.world }],
    });
  if (event.kind === "REMOVE_PAIR")
    return to({
      ...tool,
      pairs: tool.pairs.filter((_, i) => i !== event.index),
    });
  if (event.kind === "CLEAR_PAIRS")
    return to({ ...tool, pairs: [], step: { kind: "view" } });
  return to(tool);
};

const movePickingRange = (
  tool: PickingRangeTool,
  event: ToolEvent,
): ToolMove => {
  if (event.kind !== "PICK_LED") return to(tool);
  const { first } = tool;
  // A click on another string starts the range again there.
  if (!first || first.stringKey !== event.stringKey)
    return to({
      ...tool,
      first: { stringKey: event.stringKey, index: event.index },
    });
  return {
    tool: selectTool,
    effect: {
      kind: "setSegmentRange",
      virtualStringKey: tool.virtualStringKey,
      segmentIndex: tool.segmentIndex,
      stringKey: event.stringKey,
      fromIndex: Math.min(first.index, event.index),
      toIndex: Math.max(first.index, event.index),
      isReversed: event.index < first.index,
    },
  };
};

/** The tool after an event, and anything the move asks the app to do. */
export const moveTool = (tool: EditorTool, event: ToolEvent): ToolMove => {
  // These start a tool from wherever the editor is.
  if (event.kind === "SELECT") return to(selectTool);
  if (event.kind === "TOGGLE_MEASURE")
    return to(tool.kind === "measure" ? selectTool : { kind: "measure" });
  if (event.kind === "START_PLACING")
    return to({
      kind: "placing",
      stringKey: event.stringKey,
      points: [],
      confirmingDiscard: false,
    });
  if (event.kind === "START_MAPPING")
    return to({
      kind: "mapping",
      sessionKey: event.sessionKey,
      step: { kind: "view" },
      pairs: tool.kind === "mapping" ? tool.pairs : [],
    });
  if (event.kind === "START_PICKING_RANGE")
    return to({
      kind: "pickingRange",
      virtualStringKey: event.virtualStringKey,
      segmentIndex: event.segmentIndex,
      first: null,
    });

  if (tool.kind === "placing") return movePlacing(tool, event);
  if (tool.kind === "mapping") return moveMapping(tool, event);
  if (tool.kind === "pickingRange") return movePickingRange(tool, event);
  return to(tool);
};
