import { internalMutation, internalQuery } from "./_generated/server";
import type { DatabaseReader, DatabaseWriter } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { findRowProblem } from "./editorSync";

// The Nov 2026 rebuild's data migration (docs/rebuild-plan.md, "Cutover").
// Run it with `npx convex run migrations:run`, check it with
// `npx convex run migrations:check`. Both are safe to run again: a row that's
// already migrated is left as it is.
//
// What it does, per project:
// - gives every node, sequence and playlist a `key`, its own _id string, so
//   the references the rows already hold (parentId, segments[].nodeId,
//   appliesTo.nodeIds, sequenceIds, the display's mode id) are keys as they
//   stand, with nothing to rewrite;
// - drops each folder's unused `children` list;
// - moves each switch's `isOn` into its own switchStates row (true: on,
//   false: off, null: unknown);
// - repairs references that point at nothing, the way the editor's sync does
//   when a row is deleted (convex/editor.ts): a node whose parent is gone moves
//   to the top level, and segments, appliesTo entries and playlist entries that
//   point at a missing row are dropped. A segment whose range runs past its
//   string is clamped to it.

// The fields this migration removes. They aren't in the schema once it's
// narrowed, so they're read loosely.
type LegacyNode = Doc<"nodes"> & {
  children?: unknown;
  isOn?: boolean | null;
};

const keyOf = (row: { _id: string; key?: string }) => row.key ?? row._id;

const loadProject = async (db: DatabaseReader, projectId: Id<"projects">) => {
  const [nodes, sequences, playlists] = await Promise.all([
    db
      .query("nodes")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(10_000),
    db
      .query("sequences")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(10_000),
    db
      .query("playlists")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(10_000),
  ]);
  return { nodes: nodes as LegacyNode[], sequences, playlists };
};

const emptyReport = () => ({
  keysAdded: { nodes: 0, sequences: 0, playlists: 0 },
  folderChildrenDropped: 0,
  switchStatesCreated: 0,
  switchIsOnDropped: 0,
  parentsRepaired: 0,
  segmentsDropped: 0,
  segmentsClamped: 0,
  appliesToDropped: 0,
  playlistEntriesDropped: 0,
});

type Report = ReturnType<typeof emptyReport>;

const migrateProject = async (
  db: DatabaseWriter,
  projectId: Id<"projects">,
  report: Report,
) => {
  const { nodes, sequences, playlists } = await loadProject(db, projectId);

  const nodeKinds = new Map(nodes.map((n) => [keyOf(n), n.kind]));
  const ledCounts = new Map(
    nodes.flatMap((n) => (n.kind === "string" ? [[keyOf(n), n.ledCount]] : [])),
  );
  const sequenceKeys = new Set(sequences.map(keyOf));

  for (const node of nodes) {
    const patch: Record<string, unknown> = {};
    if (node.key === undefined) {
      patch.key = node._id;
      report.keysAdded.nodes++;
    }

    if (node.parentId !== null && nodeKinds.get(node.parentId) !== "folder") {
      patch.parentId = null;
      report.parentsRepaired++;
    }

    if (node.kind === "folder" && node.children !== undefined) {
      patch.children = undefined;
      report.folderChildrenDropped++;
    }

    if (node.kind === "switch") {
      const nodeKey = keyOf(node);
      const existing = await db
        .query("switchStates")
        .withIndex("by_project_node", (q) =>
          q.eq("projectId", projectId).eq("nodeKey", nodeKey),
        )
        .unique();
      if (!existing) {
        const isOn = node.isOn ?? null;
        // eslint-disable-next-line machines/no-direct-state-writes -- a migration sets a machine's first state round the machine on purpose (the library's FAQ, "How do I migrate a machine's rows?"); it lands in on, off or unknown, none of which have timers to arm.
        await db.insert("switchStates", {
          projectId,
          nodeKey,
          state:
            isOn === null
              ? { kind: "unknown" }
              : { kind: isOn ? "on" : "off", changedAt: Date.now() },
          stateTimers: [],
        });
        report.switchStatesCreated++;
      }
      if (node.isOn !== undefined) {
        patch.isOn = undefined;
        report.switchIsOnDropped++;
      }
    }

    if (node.kind === "virtual_string") {
      const segments = node.segments.flatMap((segment) => {
        const ledCount = ledCounts.get(segment.nodeId);
        if (ledCount === undefined) {
          report.segmentsDropped++;
          return [];
        }
        const fromIndex = Math.max(
          0,
          Math.min(segment.fromIndex, ledCount - 1),
        );
        const toIndex = Math.max(0, Math.min(segment.toIndex, ledCount - 1));
        if (fromIndex > toIndex) {
          report.segmentsDropped++;
          return [];
        }
        if (fromIndex !== segment.fromIndex || toIndex !== segment.toIndex)
          report.segmentsClamped++;
        return [{ ...segment, fromIndex, toIndex }];
      });
      if (JSON.stringify(segments) !== JSON.stringify(node.segments))
        patch.segments = segments;
    }

    if (Object.keys(patch).length > 0) await db.patch("nodes", node._id, patch);
  }

  for (const sequence of sequences) {
    const patch: Record<string, unknown> = {};
    if (sequence.key === undefined) {
      patch.key = sequence._id;
      report.keysAdded.sequences++;
    }
    let tracksChanged = false;
    const tracks = sequence.tracks.map((track) => ({
      ...track,
      events: track.events.map((event) => {
        if (event.appliesTo.kind !== "nodes") return event;
        const nodeIds = event.appliesTo.nodeIds.filter((id) =>
          nodeKinds.has(id),
        );
        if (nodeIds.length === event.appliesTo.nodeIds.length) return event;
        report.appliesToDropped +=
          event.appliesTo.nodeIds.length - nodeIds.length;
        tracksChanged = true;
        return { ...event, appliesTo: { kind: "nodes" as const, nodeIds } };
      }),
    }));
    if (tracksChanged) patch.tracks = tracks;
    if (Object.keys(patch).length > 0)
      await db.patch("sequences", sequence._id, patch);
  }

  for (const playlist of playlists) {
    const patch: Record<string, unknown> = {};
    if (playlist.key === undefined) {
      patch.key = playlist._id;
      report.keysAdded.playlists++;
    }
    const sequenceIds = playlist.sequenceIds.filter((id) =>
      sequenceKeys.has(id),
    );
    if (sequenceIds.length !== playlist.sequenceIds.length) {
      report.playlistEntriesDropped +=
        playlist.sequenceIds.length - sequenceIds.length;
      patch.sequenceIds = sequenceIds;
    }
    if (Object.keys(patch).length > 0)
      await db.patch("playlists", playlist._id, patch);
  }
};

/** Migrates every project. Returns what it changed (all zeros on a rerun). */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const report = emptyReport();
    const projects = await ctx.db.query("projects").take(1000);
    for (const project of projects)
      await migrateProject(ctx.db, project._id, report);
    return report;
  },
});

/**
 * Counts rows and finds anything the migration hasn't reached: rows with no
 * key, leftover legacy fields, switches with no switchStates row, and
 * references (parents, segments, appliesTo, playlist entries, the display's
 * mode) that don't resolve. `problems` is empty once it's done.
 */
export const check = internalQuery({
  args: {},
  handler: async (ctx) => {
    const problems: string[] = [];
    const counts = {
      projects: 0,
      nodes: 0,
      sequences: 0,
      playlists: 0,
      switchStates: 0,
      displayControls: 0,
      references: 0,
    };
    const projects = await ctx.db.query("projects").take(1000);
    counts.projects = projects.length;

    for (const project of projects) {
      const { nodes, sequences, playlists } = await loadProject(
        ctx.db,
        project._id,
      );
      counts.nodes += nodes.length;
      counts.sequences += sequences.length;
      counts.playlists += playlists.length;

      const switchStates = await ctx.db
        .query("switchStates")
        .withIndex("by_project_node", (q) => q.eq("projectId", project._id))
        .take(10_000);
      counts.switchStates += switchStates.length;

      const nodesByKey = new Map(nodes.map((n) => [n.key, n]));
      const sequenceKeys = new Set(sequences.map((s) => s.key));
      const playlistKeys = new Set(playlists.map((p) => p.key));
      const switchKeys = new Set(switchStates.map((s) => s.nodeKey));

      for (const [table, rows] of [
        ["nodes", nodes],
        ["sequences", sequences],
        ["playlists", playlists],
      ] as const)
        for (const row of rows)
          if (row.key === undefined)
            problems.push(`${table} ${row._id} has no key`);

      for (const node of nodes) {
        if (node.parentId !== null) {
          counts.references++;
          if (nodesByKey.get(node.parentId)?.kind !== "folder")
            problems.push(
              `node ${node.key}'s parent ${node.parentId} isn't a folder`,
            );
        }
        if (node.kind === "folder" && node.children !== undefined)
          problems.push(`folder ${node.key} still has children`);
        if (node.kind === "switch") {
          if (node.isOn !== undefined)
            problems.push(`switch ${node.key} still has isOn`);
          if (!switchKeys.has(node.key ?? node._id))
            problems.push(`switch ${node.key} has no switchStates row`);
        }
        if (node.kind === "virtual_string")
          for (const segment of node.segments) {
            counts.references++;
            const target = nodesByKey.get(segment.nodeId);
            if (target?.kind !== "string")
              problems.push(
                `virtual string ${node.key}'s segment points at ${segment.nodeId}, which isn't a string`,
              );
            else if (
              segment.fromIndex < 0 ||
              segment.toIndex > target.ledCount - 1 ||
              segment.fromIndex > segment.toIndex
            )
              problems.push(
                `virtual string ${node.key}'s segment ${segment.fromIndex}-${segment.toIndex} is outside its string's ${target.ledCount} LEDs`,
              );
          }
      }

      // Every row must pass the checks editor.sync makes, or the editor
      // couldn't save it again unchanged.
      for (const [table, rows] of [
        ["nodes", nodes],
        ["sequences", sequences],
      ] as const)
        for (const row of rows) {
          const problem = findRowProblem(table, row as never);
          if (problem) problems.push(`${table} ${row.key}: ${problem}`);
        }

      for (const sequence of sequences)
        for (const track of sequence.tracks)
          for (const event of track.events)
            if (event.appliesTo.kind === "nodes")
              for (const nodeId of event.appliesTo.nodeIds) {
                counts.references++;
                if (!nodesByKey.has(nodeId))
                  problems.push(
                    `sequence ${sequence.key}'s event ${event.id} applies to missing node ${nodeId}`,
                  );
              }

      for (const playlist of playlists)
        for (const sequenceId of playlist.sequenceIds) {
          counts.references++;
          if (!sequenceKeys.has(sequenceId))
            problems.push(
              `playlist ${playlist.key} lists missing sequence ${sequenceId}`,
            );
        }

      const control = await ctx.db
        .query("displayControls")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .unique();
      if (control) {
        counts.displayControls++;
        counts.references++;
        const { mode } = control.state.settings;
        const found =
          mode.kind === "playlist"
            ? playlistKeys.has(mode.id)
            : sequenceKeys.has(mode.id);
        if (!found)
          problems.push(`the display's ${mode.kind} ${mode.id} doesn't exist`);
      }
    }

    return { counts, problems };
  },
});
