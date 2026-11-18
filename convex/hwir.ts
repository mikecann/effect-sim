import { v } from "convex/values";
import { query } from "./_generated/server";
import { hwirMutation } from "./auth";
import { hwirPresence } from "./machines";
import { hwirPlugStatusValidator, hwirStringStatusValidator } from "./schema";

// HWIR's heartbeat (convex/hwirPresence.ts), and what the editor and phone
// read of it.

/**
 * HWIR is running: what it runs, the frame rate it really manages, how each
 * string is connected and the plug. Sent every 10 s (HEARTBEAT_INTERVAL_MS).
 */
export const heartbeat = hwirMutation({
  args: {
    projectId: v.id("projects"),
    commit: v.string(),
    fps: v.number(),
    strings: v.array(hwirStringStatusValidator),
    plug: v.optional(hwirPlugStatusValidator),
    patterns: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, { projectId, commit, fps, strings, plug, patterns }) => {
    const row = await ctx.db
      .query("hwirPresences")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
    if (!row) {
      await hwirPresence.create(
        ctx,
        { projectId, commit, fps, strings, plug, patterns },
        { type: "HEARTBEAT" },
      );
      return null;
    }
    await ctx.db.patch("hwirPresences", row._id, {
      commit,
      fps,
      strings,
      plug,
      // Absent clears it: an HWIR rolled back to before block fills sends
      // none, and must stop being shown them at once.
      patterns,
    });
    await hwirPresence.send(ctx, row._id, { type: "HEARTBEAT" });
    return null;
  },
});

/** Whether HWIR is up for this project, and how its strings are; null if it never ran. */
export const presence = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const row = await ctx.db
      .query("hwirPresences")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
    if (!row) return null;
    return {
      status: row.state.kind,
      lastSeenAt: row.state.lastSeenAt,
      commit: row.commit,
      fps: row.fps,
      strings: row.strings,
      plug: row.plug ?? null,
      patterns: row.patterns ?? [],
    };
  },
});
