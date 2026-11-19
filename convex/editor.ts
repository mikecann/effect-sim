import { ConvexError, v } from "convex/values";
import { editorMutation } from "./auth";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  nodeFieldsValidator,
  playlistFieldsValidator,
  projectFieldsValidator,
  sequenceFieldsValidator,
} from "./schema";
import {
  findRowProblem,
  findSegmentRangeProblem,
  normalizeRow,
  LIMITS,
  hasParentCycle,
  repairReferences,
  stableStringify,
  type EditorTable,
  type NodeFields,
  type PlaylistFields,
  type ProjectRows,
  type Repair,
  type SequenceFields,
} from "./editorSync";
import { machines, switchState } from "./machines";

// The editor's one way to write its data. It keeps the project in memory
// (src/common/models/sync/ProjectSyncModel.ts) and sends what changed, a
// batch at a time. A batch is one transaction across tables:
// - create/update carry the row's whole doc, checked against the table's
//   validator (and effect props against the effect's zod schema);
// - delete takes the key; whatever pointed at the row is repaired in the same
//   transaction (convex/editorSync.ts, repairReferences);
// - a change that can't apply doesn't fail the batch: an update or delete of
//   a row that's gone is skipped, and a row that breaks a rule is rejected,
//   both reported back so the editor can take the server's version.

const editorTable = v.union(
  v.literal("nodes"),
  v.literal("sequences"),
  v.literal("playlists"),
);
const writeOp = v.union(v.literal("create"), v.literal("update"));

export const changeValidator = v.union(
  v.object({
    table: v.literal("nodes"),
    op: writeOp,
    key: v.string(),
    doc: nodeFieldsValidator,
  }),
  v.object({
    table: v.literal("sequences"),
    op: writeOp,
    key: v.string(),
    doc: sequenceFieldsValidator,
  }),
  v.object({
    table: v.literal("playlists"),
    op: writeOp,
    key: v.string(),
    doc: playlistFieldsValidator,
  }),
  v.object({ table: editorTable, op: v.literal("delete"), key: v.string() }),
  v.object({
    table: v.literal("projects"),
    op: v.literal("update"),
    doc: projectFieldsValidator,
  }),
);

const outcomeValidator = v.object({
  table: v.union(editorTable, v.literal("projects")),
  key: v.string(),
  reason: v.string(),
});

export const syncResultValidator = v.object({
  applied: v.number(),
  skipped: v.array(outcomeValidator),
  rejected: v.array(outcomeValidator),
  repaired: v.array(outcomeValidator),
});

type Loaded = {
  rows: ProjectRows;
  docs: {
    nodes: Map<string, Doc<"nodes">>;
    sequences: Map<string, Doc<"sequences">>;
    playlists: Map<string, Doc<"playlists">>;
  };
};

/** Every node, sequence and playlist in the project, by key, without system fields. */
const loadProject = async (
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<Loaded> => {
  const [nodes, sequences, playlists] = await Promise.all([
    ctx.db
      .query("nodes")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(10_000),
    ctx.db
      .query("sequences")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(10_000),
    ctx.db
      .query("playlists")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(10_000),
  ]);
  const fieldsOf = <
    D extends {
      _id: unknown;
      _creationTime: unknown;
      projectId: unknown;
      key: string;
    },
  >(
    doc: D,
  ) => {
    const { _id, _creationTime, projectId: _p, key: _k, ...fields } = doc;
    return fields;
  };
  return {
    rows: {
      nodes: new Map(nodes.map((d) => [d.key, fieldsOf(d) as NodeFields])),
      sequences: new Map(
        sequences.map((d) => [d.key, fieldsOf(d) as SequenceFields]),
      ),
      playlists: new Map(
        playlists.map((d) => [d.key, fieldsOf(d) as PlaylistFields]),
      ),
    },
    docs: {
      nodes: new Map(nodes.map((d) => [d.key, d])),
      sequences: new Map(sequences.map((d) => [d.key, d])),
      playlists: new Map(playlists.map((d) => [d.key, d])),
    },
  };
};

export const sync = editorMutation({
  args: {
    projectId: v.id("projects"),
    changes: v.array(changeValidator),
  },
  returns: syncResultValidator,
  handler: async (ctx, { projectId, changes }) => {
    const project = await ctx.db.get("projects", projectId);
    if (!project)
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "That project doesn't exist any more.",
      });

    const { rows, docs } = await loadProject(ctx, projectId);
    const result = {
      applied: 0,
      skipped: [] as Repair[],
      rejected: [] as Repair[],
      repaired: [] as Repair[],
    };
    const formerParents = new Map<string, string | null>(
      [...rows.nodes].map(([key, node]) => [key, node.parentId]),
    );
    // What each changed row was before this batch (undefined: it's new), so a
    // change rejected by a check across rows can be undone.
    const before = new Map<string, unknown>();
    const remember = (table: EditorTable, key: string) => {
      const id = `${table}:${key}`;
      if (!before.has(id)) before.set(id, rows[table].get(key));
    };
    let projectFields: Doc<"projects"> | null = null;

    for (const change of changes) {
      if (change.table === "projects") {
        const problem = findRowProblem("projects", change.doc);
        if (problem) {
          result.rejected.push({ table: "projects", key: "", reason: problem });
          continue;
        }
        projectFields = { ...project, ...change.doc };
        result.applied++;
        continue;
      }
      if (change.key.length > LIMITS.key || change.key.length === 0) {
        result.rejected.push({
          table: change.table,
          key: change.key.slice(0, LIMITS.key),
          reason: `A key is 1 to ${LIMITS.key} characters.`,
        });
        continue;
      }
      const table = rows[change.table] as Map<string, unknown>;
      if (change.op === "delete") {
        if (!table.has(change.key)) {
          result.skipped.push({
            table: change.table,
            key: change.key,
            reason: "It was already deleted.",
          });
          continue;
        }
        remember(change.table, change.key);
        table.delete(change.key);
        result.applied++;
        continue;
      }
      if (change.op === "update" && !table.has(change.key)) {
        result.skipped.push({
          table: change.table,
          key: change.key,
          reason: "It was deleted, so the change was dropped.",
        });
        continue;
      }
      // A create of a row that's already saved is a retry if it matches, and
      // never overwrites it if it doesn't: an editor that missed newer
      // changes mustn't put back its old copy.
      const stored = docs[change.table].get(change.key);
      if (change.op === "create" && stored) {
        const {
          _id,
          _creationTime,
          projectId: _p,
          key: _k,
          ...fields
        } = stored;
        if (
          stableStringify(fields) ===
          stableStringify(normalizeRow(change.table, change.doc))
        )
          result.applied++;
        else
          result.skipped.push({
            table: change.table,
            key: change.key,
            reason:
              "It's already saved with newer changes, so the server's version was kept.",
          });
        continue;
      }
      const problem = findRowProblem(change.table, change.doc);
      if (problem) {
        result.rejected.push({
          table: change.table,
          key: change.key,
          reason: problem,
        });
        continue;
      }
      remember(change.table, change.key);
      if (change.table === "nodes")
        formerParents.set(change.key, change.doc.parentId);
      table.set(change.key, normalizeRow(change.table, change.doc));
      result.applied++;
    }

    // Checks across rows, on the rows this batch wrote: segments must fit the
    // strings as they now are, and a folder can't end up inside itself.
    for (const id of before.keys()) {
      const [table, key] = id.split(/:(.*)/s) as [EditorTable, string];
      if (table !== "nodes") continue;
      const node = rows.nodes.get(key);
      if (!node) continue;
      const problem =
        findSegmentRangeProblem(node, rows.nodes) ??
        (hasParentCycle(key, rows.nodes)
          ? "A folder can't go inside itself."
          : null);
      if (!problem) continue;
      const previous = before.get(id) as NodeFields | undefined;
      if (previous) rows.nodes.set(key, previous);
      else rows.nodes.delete(key);
      result.applied--;
      result.rejected.push({ table, key, reason: problem });
    }

    result.repaired = repairReferences(rows, formerParents);

    await writeRows(ctx, projectId, rows, docs);
    if (projectFields) {
      const { _id, _creationTime, ...fields } = projectFields;
      await ctx.db.replace("projects", projectId, fields);
    }
    return result;
  },
});

/** Writes what differs between the rows in memory and the database. */
const writeRows = async (
  ctx: MutationCtx,
  projectId: Id<"projects">,
  rows: ProjectRows,
  docs: Loaded["docs"],
) => {
  for (const table of ["nodes", "sequences", "playlists"] as const) {
    const wanted = rows[table] as Map<string, object>;
    const existing = docs[table] as Map<string, Doc<EditorTable>>;
    for (const [key, fields] of wanted) {
      const doc = existing.get(key);
      const full = { ...fields, projectId, key } as never;
      if (!doc) {
        await ctx.db.insert(table, full);
        continue;
      }
      const { _id, _creationTime, ...stored } = doc;
      if (stableStringify(stored) !== stableStringify(full))
        await ctx.db.replace(table, doc._id as never, full);
    }
    for (const [key, doc] of existing)
      if (!wanted.has(key)) await ctx.db.delete(table, doc._id as never);
  }

  // Switches have a switchStates row (convex/switchState.ts) for as long as
  // they exist.
  const wasSwitch = (key: string) => docs.nodes.get(key)?.kind === "switch";
  const isSwitch = (key: string) => rows.nodes.get(key)?.kind === "switch";
  for (const key of rows.nodes.keys())
    if (isSwitch(key) && !wasSwitch(key))
      await addSwitchState(ctx, projectId, key);
  for (const key of docs.nodes.keys())
    if (wasSwitch(key) && !isSwitch(key))
      await removeSwitchState(ctx, projectId, key);
};

const findSwitchState = (
  ctx: MutationCtx,
  projectId: Id<"projects">,
  nodeKey: string,
) =>
  ctx.db
    .query("switchStates")
    .withIndex("by_project_node", (q) =>
      q.eq("projectId", projectId).eq("nodeKey", nodeKey),
    )
    .first();

const addSwitchState = async (
  ctx: MutationCtx,
  projectId: Id<"projects">,
  nodeKey: string,
) => {
  const existing = await findSwitchState(ctx, projectId, nodeKey);
  if (existing && existing.state.kind !== "removed") return;
  await switchState.create(ctx, { projectId, nodeKey }, { type: "ADD" });
};

const removeSwitchState = async (
  ctx: MutationCtx,
  projectId: Id<"projects">,
  nodeKey: string,
) => {
  const row = await findSwitchState(ctx, projectId, nodeKey);
  if (!row || row.state.kind === "removed") return;
  await switchState.send(ctx, row._id, { type: "REMOVE" });
  await ctx.scheduler.runAfter(0, internal.editor.purgeSwitchState, {
    id: row._id,
  });
};

/** Deletes a removed switch's state row (only the catalog's internal ctx may purge). */
export const purgeSwitchState = machines.internalMutation({
  args: { id: v.id("switchStates") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get("switchStates", id);
    if (row?.state.kind === "removed") await switchState.purge(ctx, id);
    return null;
  },
});

/** Makes a project, with no nodes, sequences or playlists yet. */
export const createProject = editorMutation({
  args: { name: v.string() },
  returns: v.id("projects"),
  handler: async (ctx, { name }) =>
    await ctx.db.insert("projects", {
      name: name.trim() || "My Project",
      settings: { nightMode: false, lightsOnTop: false, stringLedSize: 0.1 },
    }),
});

/** Deletes a project and everything the editor made in it. */
export const deleteProject = editorMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, { projectId }) => {
    const { docs } = await loadProject(ctx, projectId);
    for (const table of ["nodes", "sequences", "playlists"] as const)
      for (const doc of (docs[table] as Map<string, Doc<EditorTable>>).values())
        await ctx.db.delete(table, doc._id as never);
    for (const key of docs.nodes.keys())
      if (docs.nodes.get(key)?.kind === "switch")
        await removeSwitchState(ctx, projectId, key);
    await ctx.db.delete("projects", projectId);
    return null;
  },
});
