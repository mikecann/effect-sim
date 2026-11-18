import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { roleMutation } from "./auth";
import { switchState } from "./machines";

// Switch plugs' live state (convex/switchState.ts). Whoever switches a plug,
// HWIR during a sequence or the editor from its inspector, reports here.

const controllerMutation = roleMutation("hwir", "editor");

const getRow = async (
  ctx: MutationCtx,
  projectId: Id<"projects">,
  nodeKey: string,
) => {
  const row = await ctx.db
    .query("switchStates")
    .withIndex("by_project_node", (q) =>
      q.eq("projectId", projectId).eq("nodeKey", nodeKey),
    )
    .first();
  if (!row || row.state.kind === "removed")
    throw new ConvexError({
      code: "NOT_FOUND",
      message: `There's no switch ${nodeKey} in this project.`,
    });
  return row;
};

const switchArgs = { projectId: v.id("projects"), nodeKey: v.string() };

/** Something is switching the plug on or off. */
export const switching = controllerMutation({
  args: { ...switchArgs, on: v.boolean() },
  handler: async (ctx, { projectId, nodeKey, on }) => {
    const row = await getRow(ctx, projectId, nodeKey);
    return await switchState.send(ctx, row._id, { type: "SWITCH", on });
  },
});

/** The plug answered: it's on, or off. */
export const turned = controllerMutation({
  args: { ...switchArgs, on: v.boolean() },
  handler: async (ctx, { projectId, nodeKey, on }) => {
    const row = await getRow(ctx, projectId, nodeKey);
    return await switchState.send(ctx, row._id, { type: "TURNED", on });
  },
});

/** The plug couldn't be switched or asked. */
export const failed = controllerMutation({
  args: { ...switchArgs, error: v.string() },
  handler: async (ctx, { projectId, nodeKey, error }) => {
    const row = await getRow(ctx, projectId, nodeKey);
    return await switchState.send(ctx, row._id, { type: "FAILED", error });
  },
});

/** Every switch's state in the project, by node key. */
export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const rows = await ctx.db
      .query("switchStates")
      .withIndex("by_project_node", (q) => q.eq("projectId", projectId))
      .take(1000);
    return rows
      .filter((row) => row.state.kind !== "removed")
      .map((row) => ({ nodeKey: row.nodeKey, state: row.state }));
  },
});
