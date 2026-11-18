import { v } from "convex/values";
import { query } from "./_generated/server";
import type { FunctionReturnType } from "convex/server";
import type { api } from "./_generated/api";
import { ensureFP } from "../shared/ensure";

// What the editor and HWIR read. Public, like every query here. The editor
// writes through editor.sync (convex/editor.ts). HWIR from before the rebuild
// reads getProject, getDataForProject, listProjects and
// listPlaylistsForProject, so they keep their names and shapes.

/** A project holds at most this many of each; far more than a house has. */
const MAX_ROWS = 10_000;

export const listPlaylistsForProject = query({
  args: { projectId: v.id("projects") },
  handler: (ctx, { projectId }) =>
    ctx.db
      .query("playlists")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(MAX_ROWS),
});

export const listProjects = query({
  args: {},
  handler: async (ctx) => ctx.db.query("projects").take(1000),
});

export const getProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) =>
    ctx.db
      .get("projects", projectId)
      .then(ensureFP(`Project not found with id '${projectId}'`)),
});

/** A project's nodes, sequences and playlists, each in the order they were made. */
export const getDataForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const [nodes, sequences, playlists] = await Promise.all([
      ctx.db
        .query("nodes")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .take(MAX_ROWS),
      ctx.db
        .query("sequences")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .take(MAX_ROWS),
      ctx.db
        .query("playlists")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .take(MAX_ROWS),
    ]);
    return { nodes, sequences, playlists };
  },
});

export type ProjectData = FunctionReturnType<
  typeof api.functions.getDataForProject
>;
