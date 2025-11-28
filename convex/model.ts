import { Infer, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { FunctionReturnType } from "convex/server";
import { api } from "./_generated/api";

const operationValidator = v.union(
  v.object({
    kind: v.literal("patch"),
    id: v.string(),
    values: v.any(),
  }),
  v.object({
    kind: v.literal("delete"),
    id: v.string(),
  }),
  v.object({
    kind: v.literal("insert"),
    values: v.any(),
    tempId: v.string(),
  }),
);

export type Operation = Infer<typeof operationValidator>;

type TableName = "projects" | "playlists" | "sequences" | "nodes";

export const applyOperations = mutation({
  args: {
    table: v.union(
      v.literal("projects"),
      v.literal("playlists"),
      v.literal("sequences"),
      v.literal("nodes"),
    ),
    operations: v.array(operationValidator),
  },
  handler: async (ctx, { table, operations }) => {
    const inserts: {
      tempId: string;
      _id: Id<TableName>;
    }[] = [];

    for (const operation of operations)
      if (operation.kind === "patch")
        await ctx.db.patch(operation.id as Id<TableName>, operation.values);
      else if (operation.kind === "delete")
        await ctx.db.delete(operation.id as Id<TableName>);
      else if (operation.kind === "insert") {
        const newId = await ctx.db.insert(table, operation.values);
        inserts.push({
          tempId: operation.tempId,
          _id: newId,
        });
      }

    return { inserts };
  },
});

export const listPlaylistsForProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, { projectId }) =>
    ctx.db
      .query("playlists")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect(),
});

export const listSequencesForProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, { projectId }) =>
    ctx.db
      .query("sequences")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect(),
});

export const listNodesForProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, { projectId }) =>
    ctx.db
      .query("nodes")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect(),
});

export const listStringsForProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, { projectId }) =>
    ctx.db
      .query("nodes")
      .withIndex("by_kind_project", (q) =>
        q.eq("kind", "string").eq("projectId", projectId),
      )
      .collect(),
});

export const listProjects = query({
  handler: async (ctx) => ctx.db.query("projects").collect(),
});

export const getAppData = query({
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();
    return { projects };
  },
});

export const getDataForProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, { projectId }) => {
    const [nodes, sequences, playlists] = await Promise.all([
      ctx.db
        .query("nodes")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("sequences")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("playlists")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
    ]);

    return { nodes, sequences, playlists };
  },
});

export type ProjectData = FunctionReturnType<
  typeof api.model.getDataForProject
>;
