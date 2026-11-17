import { v } from "convex/values";
import { query, type DatabaseReader } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { displayControl, machines } from "./machines";
import { displayModeValidator, displaySettingsValidator } from "./schema";

// The phone remote (ios/) and HWIR talk to the display through these.
// Like the rest of this deployment's functions there's no auth: anyone with
// the deployment URL can call them.

const findControl = async (
  ctx: { db: DatabaseReader },
  projectId: Id<"projects">,
) =>
  await ctx.db
    .query("displayControls")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .unique();

/** What the display should be doing, and whether HWIR has confirmed it. */
export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const row = await ctx.db
      .query("displayControls")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
    if (!row) return null;
    const { state } = row;
    return {
      settings: state.settings,
      status: state.kind,
      changedAt: state.kind === "live" ? state.appliedAt : state.requestedAt,
      requestedAt: state.kind === "live" ? null : state.requestedAt,
    };
  },
});

/** The modes the phone can pick: playlists, then single sequences. */
export const modes = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const playlists = await ctx.db
      .query("playlists")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const sequences = await ctx.db
      .query("sequences")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return [
      ...playlists.map((p) => ({
        kind: "playlist" as const,
        id: p._id,
        name: p.name,
      })),
      ...sequences.map((s) => ({
        kind: "sequence" as const,
        id: s._id,
        name: s.name,
      })),
    ];
  },
});

/** The phone changes any of on/off, brightness and mode. */
export const request = machines.mutation({
  args: {
    projectId: v.id("projects"),
    isOn: v.optional(v.boolean()),
    brightness: v.optional(v.number()),
    mode: v.optional(displayModeValidator),
  },
  handler: async (ctx, { projectId, ...patch }) => {
    const row = await findControl(ctx, projectId);
    if (!row) throw new Error("The lights runtime hasn't started yet.");
    return await displayControl.send(ctx, row._id, {
      type: "REQUEST",
      ...patch,
    });
  },
});

/** HWIR starts: makes the row from its startup flags if there isn't one. */
export const boot = machines.mutation({
  args: { projectId: v.id("projects"), settings: displaySettingsValidator },
  handler: async (ctx, { projectId, settings }) => {
    const row = await findControl(ctx, projectId);
    if (row) return null;
    await displayControl.create(
      ctx,
      { projectId },
      {
        type: "BOOT",
        settings,
      },
    );
    return null;
  },
});

/** HWIR is now playing the settings that were requested at `requestedAt`. */
export const applied = machines.mutation({
  args: { projectId: v.id("projects"), requestedAt: v.number() },
  handler: async (ctx, { projectId, requestedAt }) => {
    const row = await findControl(ctx, projectId);
    if (!row) return null;
    return await displayControl.send(ctx, row._id, {
      type: "APPLIED",
      requestedAt,
    });
  },
});
