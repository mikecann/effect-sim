import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  moveTool,
  selectTool,
  type EditorTool,
  type ToolEvent,
} from "./editorTool";

const p = (x: number) => ({ x, y: 0, z: 0 });
const run = (events: ToolEvent[], from: EditorTool = selectTool) => {
  let tool = from;
  const effects = [];
  for (const event of events) {
    const move = moveTool(tool, event);
    tool = move.tool;
    if (move.effect) effects.push(move.effect);
  }
  return { tool, effects };
};
const session = "session1" as Id<"mappingSessions">;

describe("the editor's tool", () => {
  it("toggles measuring", () => {
    expect(run([{ kind: "TOGGLE_MEASURE" }]).tool).toEqual({ kind: "measure" });
    expect(
      run([{ kind: "TOGGLE_MEASURE" }, { kind: "TOGGLE_MEASURE" }]).tool,
    ).toEqual(selectTool);
  });

  it("starts placing from any tool, leaving measuring", () => {
    const { tool } = run([
      { kind: "TOGGLE_MEASURE" },
      { kind: "START_PLACING", stringKey: "s1" },
    ]);
    expect(tool).toEqual({
      kind: "placing",
      stringKey: "s1",
      points: [],
      confirmingDiscard: false,
    });
  });

  it("adds points, and Backspace takes the last one back", () => {
    const { tool } = run([
      { kind: "START_PLACING", stringKey: "s1" },
      { kind: "ADD_POINT", point: p(0) },
      { kind: "ADD_POINT", point: p(1) },
      { kind: "ADD_POINT", point: p(2) },
      { kind: "UNDO_POINT" },
    ]);
    expect(tool.kind === "placing" && tool.points).toEqual([p(0), p(1)]);
  });

  it("finishes early with two points or more, saving the path", () => {
    const tooFew = run([
      { kind: "START_PLACING", stringKey: "s1" },
      { kind: "ADD_POINT", point: p(0) },
      { kind: "FINISH_PLACING" },
    ]);
    expect(tooFew.tool.kind).toBe("placing");
    expect(tooFew.effects).toEqual([]);

    const done = run([
      { kind: "START_PLACING", stringKey: "s1" },
      { kind: "ADD_POINT", point: p(0) },
      { kind: "ADD_POINT", point: p(1) },
      { kind: "FINISH_PLACING" },
    ]);
    expect(done.tool).toEqual(selectTool);
    expect(done.effects).toEqual([
      { kind: "savePath", stringKey: "s1", points: [p(0), p(1)] },
    ]);
  });

  it("asks before throwing points away on Esc", () => {
    const start: ToolEvent[] = [
      { kind: "START_PLACING", stringKey: "s1" },
      { kind: "ADD_POINT", point: p(0) },
      { kind: "CANCEL_PLACING" },
    ];
    const asking = run(start).tool;
    expect(asking.kind === "placing" && asking.confirmingDiscard).toBe(true);

    const kept = run([...start, { kind: "KEEP_PLACING" }]).tool;
    expect(kept.kind === "placing" && kept.points).toEqual([p(0)]);
    expect(kept.kind === "placing" && kept.confirmingDiscard).toBe(false);

    expect(run([...start, { kind: "DISCARD_PLACING" }])).toEqual({
      tool: selectTool,
      effects: [],
    });
    // A second Esc means yes.
    expect(run([...start, { kind: "CANCEL_PLACING" }]).tool).toEqual(
      selectTool,
    );
  });

  it("cancels at once when nothing is placed yet", () => {
    expect(
      run([
        { kind: "START_PLACING", stringKey: "s1" },
        { kind: "CANCEL_PLACING" },
      ]).tool,
    ).toEqual(selectTool);
  });

  it("pairs a photo point with a house point while mapping", () => {
    const { tool } = run([
      { kind: "START_MAPPING", sessionKey: session },
      { kind: "MESH_POINT", world: p(9) },
      { kind: "PICK_PAIRS" },
      { kind: "PHOTO_POINT", image: { u: 0.1, v: 0.2 } },
      { kind: "MESH_POINT", world: p(1) },
      { kind: "PHOTO_POINT", image: { u: 0.3, v: 0.4 } },
    ]);
    expect(tool).toEqual({
      kind: "mapping",
      sessionKey: session,
      step: { kind: "pickMesh", image: { u: 0.3, v: 0.4 } },
      pairs: [{ image: { u: 0.1, v: 0.2 }, world: p(1) }],
    });
    const removed = run([{ kind: "REMOVE_PAIR", index: 0 }], tool).tool;
    expect(removed.kind === "mapping" && removed.pairs).toEqual([]);
  });

  it("sets a segment's range from two clicked LEDs, reversed when picked backwards", () => {
    const { tool, effects } = run([
      {
        kind: "START_PICKING_RANGE",
        virtualStringKey: "v1",
        segmentIndex: 2,
      },
      { kind: "PICK_LED", stringKey: "a", index: 4 },
      { kind: "PICK_LED", stringKey: "b", index: 30 },
      { kind: "PICK_LED", stringKey: "b", index: 10 },
    ]);
    expect(tool).toEqual(selectTool);
    expect(effects).toEqual([
      {
        kind: "setSegmentRange",
        virtualStringKey: "v1",
        segmentIndex: 2,
        stringKey: "b",
        fromIndex: 10,
        toIndex: 30,
        isReversed: true,
      },
    ]);
  });

  it("ignores events for another tool", () => {
    expect(
      run([
        { kind: "UNDO_POINT" },
        { kind: "PICK_LED", stringKey: "a", index: 1 },
      ]).tool,
    ).toEqual(selectTool);
  });
});
