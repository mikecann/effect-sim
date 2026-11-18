import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { register } from "@convex-dev/state-machines/test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { NodeFields, SequenceFields } from "./editorSync";
import type { Infer } from "convex/values";
import type { changeValidator } from "./editor";

type Change = Infer<typeof changeValidator>;

const modules = import.meta.glob("./**/*.ts");
const token = "editor-secret";

beforeEach(() => {
  vi.stubEnv("EDITOR_TOKEN", token);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const setup = async () => {
  const t = convexTest(schema, modules);
  register(t);
  const projectId = await t.mutation(api.editor.createProject, {
    token,
    name: "House",
  });
  const sync = (changes: Change[]) =>
    t.mutation(api.editor.sync, { token, projectId, changes });
  const data = () => t.query(api.functions.getDataForProject, { projectId });
  const node = async (key: string) =>
    (await data()).nodes.find((n) => n.key === key);
  return { t, projectId, sync, data, node };
};

const icon = { kind: "emoji" as const, emoji: "1️⃣" };
const folder = (label: string, parentId: string | null = null): NodeFields => ({
  kind: "folder",
  label,
  parentId,
  order: 0,
});
const string = (
  name: string,
  ledCount = 100,
  parentId: string | null = null,
): NodeFields => ({
  kind: "string",
  name,
  icon,
  parentId,
  order: 1,
  spacingMeters: 0.1,
  ledCount,
  ipAddress: "10.0.0.2",
  port: 21324,
  brightness: 128,
  pathPoints: [],
});
const virtual = (
  segments: { nodeId: string; fromIndex: number; toIndex: number }[],
): NodeFields => ({
  kind: "virtual_string",
  name: "Virtual",
  icon,
  parentId: null,
  order: 2,
  segments,
});
const sequence = (nodeIds: string[], props?: unknown): SequenceFields => ({
  name: "Sparkles",
  numFrames: 100,
  tracks: [
    {
      id: "t1",
      name: "Track 1",
      events: [
        {
          id: "e1",
          kind: "string_effect",
          startFrame: 0,
          endFrame: 10,
          effectDefinitionId: "sparkle",
          appliesTo: { kind: "nodes", nodeIds },
          props: props ?? { color: [255, 0, 0], sparklesPerFrame: 2 },
        },
      ],
    },
  ],
});

describe("editor.sync", () => {
  test("creates rows across tables in one batch, referring to each other by key", async () => {
    const { sync, data } = await setup();
    const result = await sync([
      { table: "nodes", op: "create", key: "f", doc: folder("Strings") },
      { table: "nodes", op: "create", key: "s1", doc: string("1", 100, "f") },
      {
        table: "nodes",
        op: "create",
        key: "v",
        doc: virtual([{ nodeId: "s1", fromIndex: 0, toIndex: 49 }]),
      },
      {
        table: "sequences",
        op: "create",
        key: "q",
        doc: sequence(["s1", "v"]),
      },
      {
        table: "playlists",
        op: "create",
        key: "p",
        doc: { name: "Winter", sequenceIds: ["q", "q"] },
      },
    ]);
    expect(result).toEqual({
      applied: 5,
      skipped: [],
      rejected: [],
      repaired: [],
    });

    const { nodes, sequences, playlists } = await data();
    expect(nodes.map((n) => n.key).sort()).toEqual(["f", "s1", "v"]);
    expect(nodes.find((n) => n.key === "s1")?.parentId).toBe("f");
    expect(sequences[0]?.key).toBe("q");
    expect(playlists[0]?.sequenceIds).toEqual(["q", "q"]);
  });

  test("an update replaces the row; a create never overwrites a saved row", async () => {
    const { sync, node } = await setup();
    await sync([{ table: "nodes", op: "create", key: "s1", doc: string("1") }]);
    await sync([
      { table: "nodes", op: "update", key: "s1", doc: string("One") },
    ]);
    expect(await node("s1")).toMatchObject({ name: "One" });
    // A retry of a create whose answer was lost is fine...
    const retry = await sync([
      { table: "nodes", op: "create", key: "s1", doc: string("One") },
    ]);
    expect(retry).toMatchObject({ applied: 1, skipped: [] });
    // ...but a stale copy sent as a create doesn't overwrite newer data.
    const stale = await sync([
      { table: "nodes", op: "create", key: "s1", doc: string("1") },
    ]);
    expect(stale.applied).toBe(0);
    expect(stale.skipped.map((s) => s.key)).toEqual(["s1"]);
    expect(await node("s1")).toMatchObject({ name: "One" });
  });

  test("deleting a folder moves its children up to its parent", async () => {
    const { sync, node } = await setup();
    await sync([
      { table: "nodes", op: "create", key: "outer", doc: folder("Outer") },
      {
        table: "nodes",
        op: "create",
        key: "inner",
        doc: folder("Inner", "outer"),
      },
      {
        table: "nodes",
        op: "create",
        key: "s1",
        doc: string("1", 100, "inner"),
      },
      {
        table: "nodes",
        op: "create",
        key: "s2",
        doc: string("2", 100, "inner"),
      },
    ]);
    const result = await sync([{ table: "nodes", op: "delete", key: "inner" }]);
    expect(result.applied).toBe(1);
    expect(result.repaired.map((r) => r.key).sort()).toEqual(["s1", "s2"]);
    expect((await node("s1"))?.parentId).toBe("outer");
    expect((await node("s2"))?.parentId).toBe("outer");
    expect(await node("inner")).toBeUndefined();

    // Deleting a folder and its parent together puts the children at the top.
    await sync([
      {
        table: "nodes",
        op: "create",
        key: "inner2",
        doc: folder("Inner 2", "outer"),
      },
    ]);
    await sync([
      {
        table: "nodes",
        op: "update",
        key: "s1",
        doc: string("1", 100, "inner2"),
      },
    ]);
    await sync([
      { table: "nodes", op: "delete", key: "inner2" },
      { table: "nodes", op: "delete", key: "outer" },
    ]);
    expect((await node("s1"))?.parentId).toBeNull();
    expect((await node("s2"))?.parentId).toBeNull();
  });

  test("deleting a string drops it from virtual strings, effects and nothing else", async () => {
    const { sync, data, node } = await setup();
    await sync([
      { table: "nodes", op: "create", key: "s1", doc: string("1") },
      { table: "nodes", op: "create", key: "s2", doc: string("2") },
      {
        table: "nodes",
        op: "create",
        key: "v",
        doc: virtual([
          { nodeId: "s1", fromIndex: 0, toIndex: 9 },
          { nodeId: "s2", fromIndex: 5, toIndex: 9 },
        ]),
      },
      {
        table: "sequences",
        op: "create",
        key: "q",
        doc: sequence(["s1", "s2", "v"]),
      },
    ]);
    const result = await sync([{ table: "nodes", op: "delete", key: "s1" }]);
    expect(result.repaired.map((r) => `${r.table}:${r.key}`).sort()).toEqual([
      "nodes:v",
      "sequences:q",
    ]);
    const v = await node("v");
    expect(v?.kind === "virtual_string" && v.segments).toEqual([
      { nodeId: "s2", fromIndex: 5, toIndex: 9 },
    ]);
    const event = (await data()).sequences[0]?.tracks[0]?.events[0];
    expect(event?.appliesTo).toEqual({ kind: "nodes", nodeIds: ["s2", "v"] });
  });

  test("deleting a sequence takes it off playlists", async () => {
    const { sync, data } = await setup();
    await sync([
      { table: "sequences", op: "create", key: "a", doc: sequence([]) },
      { table: "sequences", op: "create", key: "b", doc: sequence([]) },
      {
        table: "playlists",
        op: "create",
        key: "p",
        doc: { name: "P", sequenceIds: ["a", "b", "a"] },
      },
    ]);
    await sync([{ table: "sequences", op: "delete", key: "a" }]);
    expect((await data()).playlists[0]?.sequenceIds).toEqual(["b"]);
  });

  test("a string that gets shorter trims the segments that ran past its end", async () => {
    const { sync, node } = await setup();
    await sync([
      { table: "nodes", op: "create", key: "s1", doc: string("1", 100) },
      {
        table: "nodes",
        op: "create",
        key: "v",
        doc: virtual([
          { nodeId: "s1", fromIndex: 0, toIndex: 20 },
          { nodeId: "s1", fromIndex: 40, toIndex: 99 },
          { nodeId: "s1", fromIndex: 60, toIndex: 70 },
        ]),
      },
    ]);
    const result = await sync([
      { table: "nodes", op: "update", key: "s1", doc: string("1", 50) },
    ]);
    expect(result.repaired).toHaveLength(1);
    const v = await node("v");
    expect(v?.kind === "virtual_string" && v.segments).toEqual([
      { nodeId: "s1", fromIndex: 0, toIndex: 20 },
      { nodeId: "s1", fromIndex: 40, toIndex: 49 },
    ]);
  });

  test("changes to rows that are gone are skipped and reported, and the rest still apply", async () => {
    const { sync, node } = await setup();
    await sync([{ table: "nodes", op: "create", key: "s1", doc: string("1") }]);
    const result = await sync([
      { table: "nodes", op: "update", key: "gone", doc: string("Ghost") },
      { table: "sequences", op: "delete", key: "gone-too" },
      { table: "nodes", op: "update", key: "s1", doc: string("Still here") },
    ]);
    expect(result.applied).toBe(1);
    expect(result.skipped).toEqual([
      {
        table: "nodes",
        key: "gone",
        reason: "It was deleted, so the change was dropped.",
      },
      {
        table: "sequences",
        key: "gone-too",
        reason: "It was already deleted.",
      },
    ]);
    expect(await node("gone")).toBeUndefined();
    expect(await node("s1")).toMatchObject({ name: "Still here" });
  });

  describe("rows that break a rule are rejected, and the rest apply", () => {
    test("a segment past the end of its string", async () => {
      const { sync, node } = await setup();
      const result = await sync([
        { table: "nodes", op: "create", key: "s1", doc: string("1", 100) },
        {
          table: "nodes",
          op: "create",
          key: "v",
          doc: virtual([{ nodeId: "s1", fromIndex: 50, toIndex: 100 }]),
        },
      ]);
      expect(result.applied).toBe(1);
      expect(result.rejected).toEqual([
        {
          table: "nodes",
          key: "v",
          reason:
            "A segment runs to LED 100, past the end of '1' (100 LEDs, 0 to 99).",
        },
      ]);
      expect(await node("v")).toBeUndefined();
      expect(await node("s1")).toBeDefined();
    });

    test("an update that breaks a rule leaves the row as it was", async () => {
      const { sync, node } = await setup();
      await sync([
        { table: "nodes", op: "create", key: "s1", doc: string("1", 100) },
        {
          table: "nodes",
          op: "create",
          key: "v",
          doc: virtual([{ nodeId: "s1", fromIndex: 0, toIndex: 9 }]),
        },
      ]);
      const result = await sync([
        {
          table: "nodes",
          op: "update",
          key: "v",
          doc: virtual([{ nodeId: "s1", fromIndex: 9, toIndex: 3 }]),
        },
      ]);
      expect(result.rejected).toHaveLength(1);
      const v = await node("v");
      expect(v?.kind === "virtual_string" && v.segments).toEqual([
        { nodeId: "s1", fromIndex: 0, toIndex: 9 },
      ]);
    });

    test("effect props of the wrong type, and an effect that doesn't exist", async () => {
      const { sync, data } = await setup();
      const base = sequence([]);
      const unknownEffect: SequenceFields = {
        ...base,
        tracks: base.tracks.map((track) => ({
          ...track,
          events: track.events.map((e) => ({
            ...e,
            effectDefinitionId: "disco",
          })),
        })),
      };
      const result = await sync([
        {
          table: "sequences",
          op: "create",
          key: "bad",
          doc: sequence([], { color: "red" }),
        },
        { table: "sequences", op: "create", key: "disco", doc: unknownEffect },
        // Missing props take the effect's defaults; leftovers from another effect are fine.
        {
          table: "sequences",
          op: "create",
          key: "ok",
          doc: sequence([], { color: [1, 2, 3], speed: 4 }),
        },
      ]);
      expect(result.rejected.map((r) => r.key)).toEqual(["bad", "disco"]);
      expect(result.rejected[0]?.reason).toContain("sparkle's color");
      expect(result.rejected[1]?.reason).toBe(
        "There's no string effect called 'disco'.",
      );
      expect((await data()).sequences.map((s) => s.key)).toEqual(["ok"]);
    });

    test("mapped positions that don't match the LED count", async () => {
      const { sync } = await setup();
      const result = await sync([
        {
          table: "nodes",
          op: "create",
          key: "s1",
          doc: {
            ...string("1", 3),
            ledPositions: [{ x: 0, y: 0, z: 0 }],
          } as NodeFields,
        },
      ]);
      expect(result.rejected[0]?.reason).toBe(
        "The string has 3 LEDs but 1 mapped positions.",
      );
    });

    test("a folder moved inside itself", async () => {
      const { sync, node } = await setup();
      await sync([
        { table: "nodes", op: "create", key: "a", doc: folder("A") },
        { table: "nodes", op: "create", key: "b", doc: folder("B", "a") },
      ]);
      const result = await sync([
        { table: "nodes", op: "update", key: "a", doc: folder("A", "b") },
      ]);
      expect(result.rejected).toEqual([
        {
          table: "nodes",
          key: "a",
          reason: "A folder can't go inside itself.",
        },
      ]);
      expect((await node("a"))?.parentId).toBeNull();
    });

    test("a doc that doesn't match the table's validator fails the whole call", async () => {
      const { sync, data } = await setup();
      await expect(
        sync([
          { table: "nodes", op: "create", key: "s1", doc: string("1") },
          {
            table: "nodes",
            op: "create",
            key: "x",
            doc: { kind: "folder" } as never,
          },
        ]),
      ).rejects.toThrow(/Validator/);
      expect((await data()).nodes).toEqual([]);
    });
  });

  test("a switch gets a switchStates row while it exists", async () => {
    vi.useFakeTimers();
    const { t, sync, projectId } = await setup();
    const switchDoc: NodeFields = {
      kind: "switch",
      name: "Sign",
      icon,
      ipAddress: "10.0.0.3",
      parentId: null,
      order: 0,
    };
    await sync([{ table: "nodes", op: "create", key: "sw", doc: switchDoc }]);
    expect(await t.query(api.switches.list, { projectId })).toEqual([
      { nodeKey: "sw", state: { kind: "unknown" } },
    ]);
    await sync([{ table: "nodes", op: "delete", key: "sw" }]);
    expect(await t.query(api.switches.list, { projectId })).toEqual([]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await t.run((ctx) => ctx.db.query("switchStates").collect());
    expect(rows).toEqual([]);
    vi.useRealTimers();
  });

  test("the project's name and settings save with the rest", async () => {
    const { t, sync, projectId } = await setup();
    await sync([
      {
        table: "projects",
        op: "update",
        doc: {
          name: "35 Keel",
          settings: { nightMode: true, lightsOnTop: true },
        },
      },
    ]);
    const project = await t.query(api.functions.getProject, { projectId });
    expect(project).toMatchObject({
      name: "35 Keel",
      settings: { nightMode: true },
    });
  });

  test("deleting a project deletes its rows", async () => {
    const { t, sync, projectId, data } = await setup();
    await sync([{ table: "nodes", op: "create", key: "s1", doc: string("1") }]);
    await t.mutation(api.editor.deleteProject, { token, projectId });
    expect((await data()).nodes).toEqual([]);
    expect(await t.query(api.functions.listProjects, {})).toEqual([]);
  });

  test("a project that's gone is refused", async () => {
    const { t, projectId } = await setup();
    await t.run((ctx) =>
      ctx.db.delete("projects", projectId as Id<"projects">),
    );
    await expect(
      t.mutation(api.editor.sync, { token, projectId, changes: [] }),
    ).rejects.toThrow(/doesn't exist/);
  });

  describe("limits that keep one row from blocking every save", () => {
    test("an oversized row is rejected and the rest of the batch applies", async () => {
      const { sync, node } = await setup();
      // About 1.3 MB: over the 900 KB a row may be.
      const pathPoints = Array.from({ length: 18_000 }, (_, i) => ({
        position: { x: i + 0.123456789, y: i + 0.987654321, z: i + 0.5555555 },
      }));
      const result = await sync([
        {
          table: "nodes",
          op: "create",
          key: "huge",
          doc: { ...string("Huge", 10), pathPoints } as NodeFields,
        },
        { table: "nodes", op: "create", key: "ok", doc: string("Fine") },
      ]);
      expect(result.rejected.map((r) => r.key)).toEqual(["huge"]);
      expect(result.rejected[0]?.reason).toMatch(
        /KB; a row can be at most 900 KB/,
      );
      expect(await node("huge")).toBeUndefined();
      expect(await node("ok")).toBeDefined();
    });

    test("too many segments, a long name and a bad key are rejected", async () => {
      const { sync } = await setup();
      const result = await sync([
        { table: "nodes", op: "create", key: "s1", doc: string("1") },
        {
          table: "nodes",
          op: "create",
          key: "v",
          doc: virtual(
            Array.from({ length: 1001 }, () => ({
              nodeId: "s1",
              fromIndex: 0,
              toIndex: 1,
            })),
          ),
        },
        {
          table: "nodes",
          op: "create",
          key: "long",
          doc: string("n".repeat(201)),
        },
        {
          table: "nodes",
          op: "create",
          key: "k".repeat(101),
          doc: string("key"),
        },
        {
          table: "playlists",
          op: "create",
          key: "p",
          doc: {
            name: "P",
            sequenceIds: Array.from({ length: 1001 }, () => "q"),
          },
        },
      ]);
      expect(result.applied).toBe(1);
      expect(result.rejected.map((r) => r.reason)).toEqual([
        "It has 1001 segments; the most is 1000.",
        "The name is 201 characters; the most is 200.",
        "A key is 1 to 100 characters.",
        "It has 1001 sequences; the most is 1000.",
      ]);
    });

    test("effect props out of bounds, and inherited effect names, are rejected without throwing", async () => {
      const { sync } = await setup();
      const withEffect = (
        effectDefinitionId: string,
        props: unknown,
      ): SequenceFields => {
        const base = sequence([], props);
        return {
          ...base,
          tracks: base.tracks.map((track) => ({
            ...track,
            events: track.events.map((e) => ({ ...e, effectDefinitionId })),
          })),
        };
      };
      const result = await sync([
        {
          table: "sequences",
          op: "create",
          key: "ff",
          doc: withEffect("fireflies", { numFireflies: 1e9 }),
        },
        {
          table: "sequences",
          op: "create",
          key: "ts",
          doc: withEffect("toString", {}),
        },
        {
          table: "sequences",
          op: "create",
          key: "ok",
          doc: withEffect("fireflies", { numFireflies: 105 }),
        },
      ]);
      expect(result.applied).toBe(1);
      expect(result.rejected.map((r) => r.key)).toEqual(["ff", "ts"]);
      expect(result.rejected[0]?.reason).toContain("numFireflies");
      expect(result.rejected[1]?.reason).toBe(
        "There's no string effect called 'toString'.",
      );
    });
  });

  test("moving a folder under its child while deleting that child can't make a loop", async () => {
    const { sync, node } = await setup();
    await sync([
      { table: "nodes", op: "create", key: "a", doc: folder("A") },
      { table: "nodes", op: "create", key: "b", doc: folder("B", "a") },
    ]);
    const result = await sync([
      { table: "nodes", op: "update", key: "a", doc: folder("A", "b") },
      { table: "nodes", op: "delete", key: "b" },
    ]);
    expect(result.applied).toBe(2);
    expect(await node("b")).toBeUndefined();
    expect((await node("a"))?.parentId).toBeNull();
  });

  test("project settings HWIR can't run are rejected", async () => {
    const { t, sync, projectId } = await setup();
    const settings = (extra: object) => ({
      table: "projects" as const,
      op: "update" as const,
      doc: {
        name: "House",
        settings: { nightMode: true, lightsOnTop: true, ...extra },
      },
    });
    for (const extra of [
      { defaultFramerate: Infinity },
      { defaultFramerate: 1e12 },
      { defaultFramerate: 0 },
      { stringLedSize: -1 },
    ]) {
      const result = await sync([settings(extra)]);
      expect(result.applied, JSON.stringify(extra)).toBe(0);
      expect(result.rejected).toHaveLength(1);
    }
    const ok = await sync([
      settings({ defaultFramerate: 15, stringLedSize: 0.1 }),
    ]);
    expect(ok.applied).toBe(1);
    const project = await t.query(api.functions.getProject, { projectId });
    expect(project.settings.defaultFramerate).toBe(15);
  });

  test("effect props are stored as plain JSON, with only the fields the effect takes", async () => {
    const { sync, data } = await setup();
    const result = await sync([
      // Production has props an effect switched away from left behind.
      {
        table: "sequences",
        op: "create",
        key: "left",
        doc: sequence([], { color: [1, 2, 3], numBounces: 7, speed: 1 }),
      },
      {
        table: "sequences",
        op: "create",
        key: "big",
        doc: sequence([], { color: [1, 2, 3], extra: 10n }),
      },
      {
        table: "sequences",
        op: "create",
        key: "bytes",
        doc: sequence([], { color: [1, 2, 3], extra: new ArrayBuffer(8) }),
      },
    ]);
    expect(result.applied).toBe(1);
    expect(result.rejected.map((r) => r.key)).toEqual(["big", "bytes"]);
    expect(result.rejected[0]?.reason).toBe(
      "It can't be stored: it isn't plain JSON.",
    );
    const stored = (await data()).sequences[0]?.tracks[0]?.events[0];
    expect(stored?.props).toEqual({ color: [1, 2, 3] });
  });
});
