import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";
import { editorMutation, hwirMutation } from "./auth";
import { displayControl, mappingSession } from "./machines";
import { mappingPatternValidator, stringPositionsValidator } from "./schema";

// Camera mapping sessions (convex/mappingSession.ts). The editor drives a
// session; HWIR shows its patterns and acknowledges each one.

const activeKinds = ["capturing", "solving", "review"] as const;

const findActive = async (
  ctx: { db: DatabaseReader },
  projectId: Id<"projects">,
) => {
  for (const kind of activeKinds) {
    const row = await ctx.db
      .query("mappingSessions")
      .withIndex("by_project_state", (q) =>
        q.eq("projectId", projectId).eq("state.kind", kind),
      )
      .first();
    if (row) return row;
  }
  return null;
};

/**
 * Starts a session and puts the display into mapping mode, so HWIR shows the
 * session's patterns instead of playing. One session at a time per project.
 */
export const start = editorMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    if (await findActive(ctx, projectId))
      throw new ConvexError({
        code: "BUSY",
        message: "A mapping session is already running for this project.",
      });
    const control = await ctx.db
      .query("displayControls")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
    if (!control)
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "The lights runtime hasn't started for this project yet.",
      });
    const created = await mappingSession.create(
      ctx,
      { projectId, startedAt: Date.now() },
      { type: "START" },
    );
    if (created.status !== "done") return created;
    const mapped = await displayControl.send(ctx, control._id, {
      type: "MAP",
      sessionId: created.id,
    });
    if (mapped.status !== "done")
      throw new ConvexError({
        code: mapped.code,
        message: mapped.reasons.join(" "),
      });
    return created;
  },
});

const sessionArgs = { sessionId: v.id("mappingSessions") };

/** The camera wants this pattern next. */
export const show = editorMutation({
  args: { ...sessionArgs, pattern: mappingPatternValidator },
  handler: async (ctx, { sessionId, pattern }) =>
    await mappingSession.send(ctx, sessionId, { type: "SHOW", pattern }),
});

/** HWIR has sent pattern `seq` out to the strings. */
export const shown = hwirMutation({
  args: { ...sessionArgs, seq: v.number() },
  handler: async (ctx, { sessionId, seq }) =>
    await mappingSession.send(ctx, sessionId, { type: "SHOWN", seq }),
});

/** The camera has its photos; the lights go back to playing. */
export const captured = editorMutation({
  args: sessionArgs,
  handler: async (ctx, { sessionId }) =>
    await mappingSession.send(ctx, sessionId, { type: "CAPTURED" }),
});

/** The photos became these positions, for review. */
export const solved = editorMutation({
  args: { ...sessionArgs, proposed: v.array(stringPositionsValidator) },
  handler: async (ctx, { sessionId, proposed }) =>
    await mappingSession.send(ctx, sessionId, { type: "SOLVED", proposed }),
});

/** Capture again, from solving or review. */
export const recapture = editorMutation({
  args: sessionArgs,
  handler: async (ctx, { sessionId }) =>
    await mappingSession.send(ctx, sessionId, { type: "RECAPTURE" }),
});

/** Put the reviewed positions on the strings. */
export const apply = editorMutation({
  args: sessionArgs,
  handler: async (ctx, { sessionId }) =>
    await mappingSession.send(ctx, sessionId, { type: "APPLY" }),
});

/** Give the strings back the positions they had before the session. */
export const rollback = editorMutation({
  args: sessionArgs,
  handler: async (ctx, { sessionId }) =>
    await mappingSession.send(ctx, sessionId, { type: "ROLLBACK" }),
});

/** Give up on the session. */
export const discard = editorMutation({
  args: sessionArgs,
  handler: async (ctx, { sessionId }) =>
    await mappingSession.send(ctx, sessionId, { type: "DISCARD" }),
});

/** The project's running session (capturing, solving or in review), or null. */
export const active = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const row = await findActive(ctx, projectId);
    return row
      ? { id: row._id, startedAt: row.startedAt, state: row.state }
      : null;
  },
});

/** One session, for HWIR to follow the pattern it should show. */
export const get = query({
  args: sessionArgs,
  handler: async (ctx, { sessionId }) => {
    const row = await ctx.db.get("mappingSessions", sessionId);
    return row
      ? { id: row._id, projectId: row.projectId, state: row.state }
      : null;
  },
});
