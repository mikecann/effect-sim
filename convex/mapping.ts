import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";
import { editorMutation, hwirMutation } from "./auth";
import { displayControl, machines, mappingSession } from "./machines";
import {
  mappingPatternValidator,
  mappingViewValidator,
  stringPositionsValidator,
} from "./schema";

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

const findControl = async (
  ctx: { db: DatabaseReader },
  projectId: Id<"projects">,
) => {
  const control = await ctx.db
    .query("displayControls")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .unique();
  if (!control)
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "The lights runtime hasn't started for this project yet.",
    });
  return control._id;
};

/**
 * Puts the display into mapping mode for this session, so HWIR shows its
 * patterns. Throws (undoing the whole mutation) if the display refuses.
 */
const mapDisplay = async (
  ctx: Parameters<typeof displayControl.send>[0],
  control: Id<"displayControls">,
  sessionId: Id<"mappingSessions">,
) => {
  const mapped = await displayControl.send(ctx, control, {
    type: "MAP",
    sessionId,
  });
  if (mapped.status !== "done")
    throw new ConvexError({
      code: mapped.code,
      message: mapped.reasons.join(" "),
    });
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
    const control = await findControl(ctx, projectId);
    const created = await mappingSession.create(
      ctx,
      { projectId, startedAt: Date.now() },
      { type: "START" },
    );
    if (created.status !== "done") return created;
    await mapDisplay(ctx, control, created.id as Id<"mappingSessions">);
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

/**
 * Capture again, from solving or review. Leaving capturing gave the lights
 * back to the playlist, so this puts the display into mapping mode again.
 */
export const recapture = editorMutation({
  args: sessionArgs,
  handler: async (ctx, { sessionId }) => {
    const sent = await mappingSession.send(ctx, sessionId, {
      type: "RECAPTURE",
    });
    if (sent.status !== "done") return sent;
    const row = await ctx.db.get("mappingSessions", sessionId);
    if (row)
      await mapDisplay(ctx, await findControl(ctx, row.projectId), sessionId);
    return sent;
  },
});

/** Back from review to lining the photo up again; the capture stays. */
export const realign = editorMutation({
  args: sessionArgs,
  handler: async (ctx, { sessionId }) =>
    await mappingSession.send(ctx, sessionId, { type: "REALIGN" }),
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

/** A URL to upload one photo to file storage (tools/mapping `upload`). */
export const generateUploadUrl = editorMutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

/**
 * Adds one camera viewpoint's 2D points and photos to a session, replacing a
 * view of the same name (and deleting its old photos). Works while capturing,
 * so several viewpoints can go into one session, and while solving.
 */
export const addView = editorMutation({
  args: { ...sessionArgs, view: mappingViewValidator },
  handler: async (ctx, { sessionId, view }) => {
    const row = await ctx.db.get("mappingSessions", sessionId);
    if (!row)
      throw new ConvexError({ code: "NOT_FOUND", message: "No such session." });
    if (row.state.kind !== "capturing" && row.state.kind !== "solving")
      throw new ConvexError({
        code: "NOT_ACCEPTED",
        message: `The session is ${row.state.kind}; views go in while capturing or solving.`,
      });
    const views = row.views ?? [];
    const replaced = views.find((existing) => existing.name === view.name);
    if (replaced)
      for (const id of [replaced.photo, replaced.darkPhoto])
        if (id && id !== view.photo && id !== view.darkPhoto)
          await ctx.storage.delete(id);
    await ctx.db.patch("mappingSessions", sessionId, {
      views: [...views.filter((existing) => existing !== replaced), view],
    });
  },
});

/** Every photo some session's view still holds, across all projects. */
const photosInUse = async (ctx: { db: DatabaseReader }) => {
  const used = new Set<string>();
  // A house has a handful of sessions; this is plenty.
  for (const row of await ctx.db.query("mappingSessions").take(1000))
    for (const view of row.views ?? [])
      for (const id of [view.photo, view.darkPhoto]) if (id) used.add(id);
  return used;
};

/**
 * Deletes photos the tool uploaded but couldn't attach to a view (the session
 * had moved on). Photos a view holds are left alone.
 */
export const deleteUnattached = editorMutation({
  args: { storageIds: v.array(v.id("_storage")) },
  returns: v.number(),
  handler: async (ctx, { storageIds }) => {
    const used = await photosInUse(ctx);
    let deleted = 0;
    for (const id of storageIds)
      if (!used.has(id) && (await ctx.db.system.get("_storage", id))) {
        await ctx.storage.delete(id);
        deleted++;
      }
    return deleted;
  },
});

/** Uploaded photos younger than this may still be on their way into a view. */
export const UNATTACHED_PHOTO_GRACE_MS = 24 * 60 * 60_000;

/**
 * Daily (convex/crons.ts): a discarded session's views are no use, so their
 * photos go; and so does any upload no view holds after a day (a tool that
 * crashed between uploading and attaching). Mapping is the only thing that
 * uses file storage.
 */
export const cleanUpPhotos = machines.internalMutation({
  args: {},
  returns: v.object({ views: v.number(), photos: v.number() }),
  handler: async (ctx) => {
    let views = 0;
    const discarded = await ctx.db
      .query("mappingSessions")
      .take(1000)
      .then((rows) =>
        rows.filter((r) => r.state.kind === "discarded" && r.views?.length),
      );
    for (const row of discarded) {
      views += row.views?.length ?? 0;
      await ctx.db.patch("mappingSessions", row._id, { views: undefined });
    }
    const used = await photosInUse(ctx);
    const cutoff = Date.now() - UNATTACHED_PHOTO_GRACE_MS;
    let photos = 0;
    for (const file of await ctx.db.system.query("_storage").take(5000))
      if (!used.has(file._id) && file._creationTime < cutoff) {
        await ctx.storage.delete(file._id);
        photos++;
      }
    return { views, photos };
  },
});

/** A session's camera views, with URLs for their photos. */
export const views = query({
  args: sessionArgs,
  handler: async (ctx, { sessionId }) => {
    const row = await ctx.db.get("mappingSessions", sessionId);
    if (!row) return null;
    return await Promise.all(
      (row.views ?? []).map(async (view) => ({
        ...view,
        photoUrl: await ctx.storage.getUrl(view.photo),
        darkPhotoUrl: view.darkPhoto
          ? await ctx.storage.getUrl(view.darkPhoto)
          : null,
      })),
    );
  },
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

/** The project's newest session in any state (so an applied one can be rolled back), or null. */
export const latest = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const rows = await ctx.db
      .query("mappingSessions")
      .withIndex("by_project_state", (q) => q.eq("projectId", projectId))
      // A project has a handful of sessions; this is plenty.
      .take(500);
    const row = rows.reduce<(typeof rows)[number] | null>(
      (newest, r) => (!newest || r.startedAt > newest.startedAt ? r : newest),
      null,
    );
    return row
      ? { id: row._id, startedAt: row.startedAt, state: row.state }
      : null;
  },
});
