import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { register } from "@convex-dev/state-machines/test";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

// Production's data is from before the rebuild, which the schema no longer
// takes: so here the editor's tables take anything, as they did in the
// widened schema the migration first runs on.
const legacySchema = defineSchema({
  ...schema.tables,
  nodes: defineTable(v.any())
    .index("by_project", ["projectId"])
    .index("by_project_key", ["projectId", "key"]),
  sequences: defineTable(v.any())
    .index("by_project", ["projectId"])
    .index("by_project_key", ["projectId", "key"]),
  playlists: defineTable(v.any())
    .index("by_project", ["projectId"])
    .index("by_project_key", ["projectId", "key"]),
});

const setup = () => {
  const t = convexTest(legacySchema, modules);
  register(t);
  return t;
};

const icon = { kind: "emoji" as const, emoji: "1️⃣" };

/** A project shaped like production before the rebuild, with a few broken references. */
const seedLegacyProject = (t: ReturnType<typeof setup>) =>
  t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", {
      name: "House",
      settings: { nightMode: true, lightsOnTop: true },
    });
    const folder = await ctx.db.insert("nodes", {
      projectId,
      parentId: null,
      order: 0,
      kind: "folder",
      label: "Strings",
      children: [],
    });
    const string = await ctx.db.insert("nodes", {
      projectId,
      parentId: folder,
      order: 0,
      kind: "string",
      name: "1",
      icon,
      spacingMeters: 0.1,
      ledCount: 100,
      ipAddress: "10.0.0.2",
      port: 21324,
      brightness: 128,
      pathPoints: [],
    });
    const gone = await ctx.db.insert("nodes", {
      projectId,
      parentId: null,
      order: 9,
      kind: "folder",
      label: "deleted later",
    });
    const orphan = await ctx.db.insert("nodes", {
      projectId,
      parentId: gone,
      order: 1,
      kind: "switch",
      name: "Sign",
      icon,
      ipAddress: "10.0.0.3",
      isOn: true,
    });
    const unknownSwitch = await ctx.db.insert("nodes", {
      projectId,
      parentId: null,
      order: 2,
      kind: "switch",
      name: "Roof",
      icon,
      ipAddress: "10.0.0.4",
      isOn: null,
    });
    const virtual = await ctx.db.insert("nodes", {
      projectId,
      parentId: null,
      order: 3,
      kind: "virtual_string",
      name: "Top",
      icon,
      segments: [
        { nodeId: string, fromIndex: 0, toIndex: 49 },
        { nodeId: string, fromIndex: 90, toIndex: 120 }, // past its 100 LEDs
        { nodeId: gone, fromIndex: 0, toIndex: 5 }, // not a string
      ],
    });
    const sequence = await ctx.db.insert("sequences", {
      projectId,
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
              appliesTo: { kind: "nodes", nodeIds: [string, gone, virtual] },
            },
          ],
        },
      ],
    });
    const deletedSequence = await ctx.db.insert("sequences", {
      projectId,
      name: "Deleted",
      numFrames: 1,
      tracks: [],
    });
    const playlist = await ctx.db.insert("playlists", {
      projectId,
      name: "Winter",
      sequenceIds: [sequence, deletedSequence, sequence],
    });
    await ctx.db.insert("displayControls", {
      projectId,
      state: {
        kind: "live",
        settings: {
          isOn: true,
          brightness: 1,
          mode: { kind: "playlist", id: playlist },
        },
        appliedAt: 1,
      },
      stateTimers: [],
    });
    await ctx.db.delete(gone);
    await ctx.db.delete(deletedSequence);
    return {
      projectId,
      folder,
      string,
      orphan,
      unknownSwitch,
      virtual,
      sequence,
      playlist,
    };
  });

test("the migration keys every row, moves switch power out and repairs references", async () => {
  const t = setup();
  const ids = await seedLegacyProject(t);

  const before = await t.query(internal.migrations.check, {});
  expect(before.problems.length).toBeGreaterThan(0);

  const report = await t.mutation(internal.migrations.run, {});
  expect(report).toEqual({
    keysAdded: { nodes: 5, sequences: 1, playlists: 1 },
    folderChildrenDropped: 1,
    switchStatesCreated: 2,
    switchIsOnDropped: 2,
    parentsRepaired: 1,
    segmentsDropped: 1,
    segmentsClamped: 1,
    appliesToDropped: 1,
    playlistEntriesDropped: 1,
  });

  const after = await t.query(internal.migrations.check, {});
  expect(after.problems).toEqual([]);
  expect(after.counts).toEqual({
    projects: 1,
    nodes: 5,
    sequences: 1,
    playlists: 1,
    switchStates: 2,
    displayControls: 1,
    // 1 parent, 2 segments, 2 appliesTo, 2 playlist entries, the display mode
    references: 8,
  });

  await t.run(async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the legacy tables hold v.any() docs.
    const get = async (id: string): Promise<any> => {
      const node = await ctx.db.get(id as never);
      if (!node) throw new Error(`${id} is gone`);
      return node;
    };
    const string = await get(ids.string);
    expect(string.key).toBe(ids.string);
    expect(string.parentId).toBe(ids.folder);
    expect((await get(ids.folder)).children).toBeUndefined();
    const orphan = await get(ids.orphan);
    expect(orphan.parentId).toBeNull();
    expect(orphan.isOn).toBeUndefined();
    const virtual = await get(ids.virtual);
    expect(virtual.segments).toEqual([
      { nodeId: ids.string, fromIndex: 0, toIndex: 49 },
      { nodeId: ids.string, fromIndex: 90, toIndex: 99 },
    ]);
    const switches = await ctx.db.query("switchStates").collect();
    expect(
      Object.fromEntries(switches.map((s) => [s.nodeKey, s.state.kind])),
    ).toEqual({ [ids.orphan]: "on", [ids.unknownSwitch]: "unknown" });
    const playlist = await get(ids.playlist);
    expect(playlist.sequenceIds).toEqual([ids.sequence, ids.sequence]);
  });

  // A second run changes nothing.
  const again = await t.mutation(internal.migrations.run, {});
  expect(
    Object.values(again).every((n) => typeof n === "object" || n === 0),
  ).toBe(true);
  expect(again.keysAdded).toEqual({ nodes: 0, sequences: 0, playlists: 0 });
});
