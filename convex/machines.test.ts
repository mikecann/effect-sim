import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { advance, register } from "@convex-dev/state-machines/test";
import { missingDescriptions } from "@convex-dev/state-machines";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { machines } from "./machines";

const modules = import.meta.glob("./**/*.ts");
const tokens = { editor: "e-token", hwir: "h-token", remote: "r-token" };
const icon = { kind: "emoji" as const, emoji: "1️⃣" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("EDITOR_TOKEN", tokens.editor);
  vi.stubEnv("HWIR_TOKEN", tokens.hwir);
  vi.stubEnv("REMOTE_TOKEN", tokens.remote);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const setup = async () => {
  const t = convexTest(schema, modules);
  register(t);
  const projectId = await t.mutation(api.editor.createProject, {
    token: tokens.editor,
    name: "House",
  });
  const display = () => t.query(api.display.get, { projectId });
  const boot = () =>
    t.mutation(api.display.boot, {
      token: tokens.hwir,
      projectId,
      settings: {
        isOn: true,
        brightness: 1,
        mode: { kind: "playlist", id: "winter" },
      },
    });
  return { t, projectId, display, boot };
};

test("every state and transition has a description", () => {
  expect(missingDescriptions(machines.manifests)).toEqual([]);
});

describe("displayControl", () => {
  test("a request waits for HWIR to apply it, and times out if it doesn't", async () => {
    const { t, projectId, display, boot } = await setup();
    await boot();
    expect((await display())?.status).toBe("live");

    await t.mutation(api.display.request, {
      token: tokens.remote,
      projectId,
      brightness: 2,
      mode: { kind: "sequence", id: "sparkles" },
    });
    const applying = await display();
    expect(applying).toMatchObject({
      status: "applying",
      settings: {
        isOn: true,
        brightness: 1,
        mode: { kind: "sequence", id: "sparkles" },
      },
    });

    const stale = await t.mutation(api.display.applied, {
      token: tokens.hwir,
      projectId,
      requestedAt: 1,
    });
    expect(stale).toMatchObject({ status: "rejected", code: "GUARD_BLOCKED" });

    await t.mutation(api.display.applied, {
      token: tokens.hwir,
      projectId,
      requestedAt: applying?.requestedAt ?? 0,
    });
    expect((await display())?.status).toBe("live");

    await t.mutation(api.display.request, {
      token: tokens.remote,
      projectId,
      isOn: false,
    });
    await advance(t, 16_000);
    expect(await display()).toMatchObject({
      status: "unreachable",
      settings: { isOn: false },
    });
  });

  test("the plug switched outside the app moves on/off", async () => {
    const { t, projectId, display, boot } = await setup();
    await boot();
    await t.mutation(api.display.plugSwitched, {
      token: tokens.hwir,
      projectId,
      isOn: false,
    });
    expect(await display()).toMatchObject({
      status: "live",
      settings: { isOn: false },
    });
  });
});

describe("hwirPresence", () => {
  test("heartbeats keep it online; missing them makes it stale, then offline", async () => {
    const { t, projectId } = await setup();
    const presence = () => t.query(api.hwir.presence, { projectId });
    const heartbeat = (fps = 15) =>
      t.mutation(api.hwir.heartbeat, {
        token: tokens.hwir,
        projectId,
        commit: "abc123",
        fps,
        strings: [{ key: "s1", connection: "live" }],
      });
    expect(await presence()).toBeNull();

    await heartbeat();
    expect(await presence()).toMatchObject({
      status: "online",
      commit: "abc123",
      fps: 15,
      strings: [{ key: "s1", connection: "live" }],
    });

    for (let i = 0; i < 5; i++) {
      await advance(t, 10_000);
      await heartbeat(14);
    }
    expect(await presence()).toMatchObject({ status: "online", fps: 14 });

    await advance(t, 31_000);
    expect((await presence())?.status).toBe("stale");
    await advance(t, 90_000);
    expect((await presence())?.status).toBe("offline");

    await heartbeat();
    expect((await presence())?.status).toBe("online");
  });
});

describe("switchState", () => {
  const setupSwitch = async () => {
    const ctx = await setup();
    await ctx.t.mutation(api.editor.sync, {
      token: tokens.editor,
      projectId: ctx.projectId,
      changes: [
        {
          table: "nodes",
          op: "create",
          key: "sw",
          doc: {
            kind: "switch",
            name: "Sign",
            icon,
            ipAddress: "10.0.0.3",
            parentId: null,
            order: 0,
          },
        },
      ],
    });
    const args = {
      token: tokens.hwir,
      projectId: ctx.projectId,
      nodeKey: "sw",
    };
    const state = async () =>
      (await ctx.t.query(api.switches.list, { projectId: ctx.projectId }))[0]
        ?.state;
    return { ...ctx, args, state };
  };

  test("switching, then the plug's answer", async () => {
    const { t, args, state } = await setupSwitch();
    expect(await state()).toEqual({ kind: "unknown" });
    await t.mutation(api.switches.switching, { ...args, on: true });
    expect(await state()).toMatchObject({ kind: "switching", target: true });
    await t.mutation(api.switches.turned, { ...args, on: true });
    expect((await state())?.kind).toBe("on");
    await t.mutation(api.switches.turned, { ...args, on: true });
    expect((await state())?.kind).toBe("on");
    await t.mutation(api.switches.turned, { ...args, on: false });
    expect((await state())?.kind).toBe("off");
  });

  test("a plug that doesn't answer, or fails, is unreachable until it answers", async () => {
    const { t, args, state } = await setupSwitch();
    await t.mutation(api.switches.switching, { ...args, on: false });
    await advance(t, 11_000);
    expect(await state()).toMatchObject({ kind: "unreachable" });

    await t.mutation(api.switches.turned, { ...args, on: false });
    expect((await state())?.kind).toBe("off");
    await t.mutation(api.switches.failed, { ...args, error: "ECONNREFUSED" });
    expect(await state()).toMatchObject({
      kind: "unreachable",
      error: "ECONNREFUSED",
    });
  });
});

describe("mappingSession", () => {
  const setupMapping = async () => {
    const ctx = await setup();
    await ctx.boot();
    await ctx.t.mutation(api.editor.sync, {
      token: tokens.editor,
      projectId: ctx.projectId,
      changes: [
        {
          table: "nodes",
          op: "create",
          key: "s1",
          doc: {
            kind: "string",
            name: "1",
            icon,
            parentId: null,
            order: 0,
            spacingMeters: 0.1,
            ledCount: 2,
            ipAddress: "10.0.0.2",
            port: 21324,
            brightness: 128,
            pathPoints: [],
          },
        },
      ],
    });
    const started = await ctx.t.mutation(api.mapping.start, {
      token: tokens.editor,
      projectId: ctx.projectId,
    });
    if (started.status !== "done") throw new Error("didn't start");
    const sessionId = started.id as Id<"mappingSessions">;
    const session = async () =>
      (await ctx.t.query(api.mapping.get, { sessionId }))?.state;
    const send = {
      editor: { token: tokens.editor, sessionId },
      hwir: { token: tokens.hwir, sessionId },
    };
    return { ...ctx, sessionId, session, send };
  };

  test("starting puts the display into mapping mode; a second session is refused", async () => {
    const { t, projectId, display, sessionId, session } = await setupMapping();
    expect(await session()).toMatchObject({
      kind: "capturing",
      request: { seq: 0, pattern: { kind: "off" } },
      shownSeq: null,
    });
    expect(await display()).toMatchObject({
      status: "applying",
      settings: {
        mode: {
          kind: "mapping",
          id: sessionId,
          returnTo: { kind: "playlist", id: "winter" },
        },
      },
    });
    await expect(
      t.mutation(api.mapping.start, { token: tokens.editor, projectId }),
    ).rejects.toThrow(/already running/);
  });

  test("patterns, acks, capture, solve, apply and roll back", async () => {
    const { t, projectId, display, session, send } = await setupMapping();
    await t.mutation(api.mapping.show, {
      ...send.editor,
      pattern: { kind: "led", nodeKey: "s1", index: 1 },
    });
    expect(await session()).toMatchObject({
      request: { seq: 1 },
      shownSeq: null,
    });

    const old = await t.mutation(api.mapping.shown, { ...send.hwir, seq: 0 });
    expect(old).toMatchObject({ status: "rejected", code: "GUARD_BLOCKED" });
    await t.mutation(api.mapping.shown, { ...send.hwir, seq: 1 });
    expect(await session()).toMatchObject({ shownSeq: 1 });

    // HWIR can't drive a session, and the editor can't ack.
    await expect(
      t.mutation(api.mapping.show, {
        ...send.editor,
        token: tokens.hwir,
        pattern: { kind: "all" },
      }),
    ).rejects.toThrow(/isn't the editor token/);

    await t.mutation(api.mapping.captured, send.editor);
    expect((await session())?.kind).toBe("solving");
    expect(await display()).toMatchObject({
      status: "applying",
      settings: { mode: { kind: "playlist", id: "winter" } },
    });

    const positions = [
      { x: 1, y: 2, z: 3 },
      { x: 4, y: 5, z: 6 },
    ];
    await t.mutation(api.mapping.solved, {
      ...send.editor,
      proposed: [
        { nodeKey: "s1", ledPositions: positions },
        { nodeKey: "missing", ledPositions: positions },
      ],
    });
    expect((await session())?.kind).toBe("review");

    await t.mutation(api.mapping.apply, send.editor);
    expect(await session()).toMatchObject({
      kind: "applied",
      previous: [{ nodeKey: "s1", ledPositions: null }],
    });
    const nodes = async () =>
      (await t.query(api.functions.getDataForProject, { projectId })).nodes;
    expect((await nodes())[0]).toMatchObject({ ledPositions: positions });

    await t.mutation(api.mapping.rollback, send.editor);
    expect((await session())?.kind).toBe("discarded");
    expect(
      (await nodes())[0]?.kind === "string" && (await nodes())[0],
    ).not.toHaveProperty("ledPositions");
  });

  const beat = (
    t: Awaited<ReturnType<typeof setupMapping>>["t"],
    projectId: Id<"projects">,
    patterns?: string[],
  ) =>
    t.mutation(api.hwir.heartbeat, {
      token: tokens.hwir,
      projectId,
      commit: patterns ? "new123" : "old123",
      fps: 15,
      strings: [{ key: "s1", connection: "live" }],
      ...(patterns ? { patterns } : {}),
    });

  test("ranges are only shown, and their acks only taken, from an HWIR that renders them", async () => {
    const { t, projectId, session, send } = await setupMapping();
    const pattern = {
      kind: "ranges" as const,
      ranges: [{ nodeKey: "s1", from: 0, to: 1 }],
    };
    // No heartbeat yet, then an old HWIR: refused.
    await expect(
      t.mutation(api.mapping.show, { ...send.editor, pattern }),
    ).rejects.toThrow(/doesn.t render/);
    await beat(t, projectId);
    await expect(
      t.mutation(api.mapping.show, { ...send.editor, pattern }),
    ).rejects.toThrow(/doesn.t render/);

    await beat(t, projectId, ["off", "all", "string", "led", "bit", "ranges"]);
    await t.mutation(api.mapping.show, { ...send.editor, pattern });
    const seq = (await session())?.kind === "capturing" ? 1 : -1;

    // An ack from an HWIR that doesn't list ranges (rolled back) is dropped.
    expect(
      await t.mutation(api.mapping.shown, { ...send.hwir, seq }),
    ).toMatchObject({ status: "ignored" });
    expect(await session()).not.toMatchObject({ shownSeq: seq });
    await t.mutation(api.mapping.shown, {
      ...send.hwir,
      seq,
      patterns: ["ranges"],
    });
    expect(await session()).toMatchObject({ shownSeq: seq });

    // A rolled-back HWIR's heartbeat (no patterns) clears what it renders.
    await beat(t, projectId);
    expect(
      (await t.query(api.hwir.presence, { projectId }))?.patterns,
    ).toEqual([]);
    await expect(
      t.mutation(api.mapping.show, { ...send.editor, pattern }),
    ).rejects.toThrow(/doesn.t render/);
  });

  test("ranges light runs of LEDs; malformed or too many are refused", async () => {
    const { t, projectId, session, send } = await setupMapping();
    await beat(t, projectId, ["ranges"]);
    const ranges = [
      { nodeKey: "s1", from: 0, to: 1 },
      { nodeKey: "s2", from: 40, to: 47 },
    ];
    await t.mutation(api.mapping.show, {
      ...send.editor,
      pattern: { kind: "ranges", ranges },
    });
    expect(await session()).toMatchObject({
      request: { seq: 1, pattern: { kind: "ranges", ranges } },
    });

    for (const bad of [
      { nodeKey: "s1", from: 3, to: 2 },
      { nodeKey: "s1", from: -1, to: 2 },
      { nodeKey: "s1", from: 0.5, to: 2 },
    ])
      await expect(
        t.mutation(api.mapping.show, {
          ...send.editor,
          pattern: { kind: "ranges", ranges: [bad] },
        }),
      ).rejects.toThrow(/isn't a run of LED indexes/);
    await expect(
      t.mutation(api.mapping.show, {
        ...send.editor,
        pattern: {
          kind: "ranges",
          ranges: Array.from({ length: 201 }, (_, i) => ({
            nodeKey: "s1",
            from: i,
            to: i,
          })),
        },
      }),
    ).rejects.toThrow(/at most 200 ranges/);
    expect(await session()).toMatchObject({ request: { seq: 1 } });
  });

  test("a capture nobody finishes is abandoned, and the display goes back", async () => {
    const { t, display, session } = await setupMapping();
    await advance(t, 10 * 60_000 + 1000);
    expect(await session()).toMatchObject({
      kind: "discarded",
      reason: expect.stringContaining("Abandoned"),
    });
    expect((await display())?.settings.mode).toEqual({
      kind: "playlist",
      id: "winter",
    });
  });

  test("the phone can still change mode while mapping, which ends it on the lights", async () => {
    const { t, projectId, display, send, session } = await setupMapping();
    await t.mutation(api.display.request, {
      token: tokens.remote,
      projectId,
      mode: { kind: "sequence", id: "sparkles" },
    });
    // The session's end doesn't undo the phone's choice.
    await t.mutation(api.mapping.discard, send.editor);
    expect((await session())?.kind).toBe("discarded");
    expect((await display())?.settings.mode).toEqual({
      kind: "sequence",
      id: "sparkles",
    });
  });

  test("recapturing puts the display back into mapping mode", async () => {
    const { t, display, sessionId, send } = await setupMapping();
    await t.mutation(api.mapping.captured, send.editor);
    expect((await display())?.settings.mode).toEqual({
      kind: "playlist",
      id: "winter",
    });
    await t.mutation(api.mapping.recapture, send.editor);
    expect((await display())?.settings.mode).toEqual({
      kind: "mapping",
      id: sessionId,
      returnTo: { kind: "playlist", id: "winter" },
    });
    // And from review, too.
    await t.mutation(api.mapping.captured, send.editor);
    await t.mutation(api.mapping.solved, { ...send.editor, proposed: [] });
    await t.mutation(api.mapping.recapture, send.editor);
    expect((await display())?.settings.mode).toMatchObject({
      kind: "mapping",
      id: sessionId,
    });
  });

  test("photos no view holds are deleted: on request, and daily however many sessions there are", async () => {
    const { t, projectId, sessionId: first, send } = await setupMapping();
    const store = () =>
      t.run(async (ctx) => await ctx.storage.store(new Blob(["jpeg"])));
    const stored = async () =>
      new Set(
        await t.run(async (ctx) =>
          (await ctx.db.system.query("_storage").collect()).map((f) => f._id),
        ),
      );
    const addView = async (sessionId: Id<"mappingSessions">) => {
      const photo = await store();
      await t.mutation(api.mapping.addView, {
        token: tokens.editor,
        sessionId,
        view: {
          name: "front",
          uploadedAt: 1,
          photo,
          imageWidth: 10,
          imageHeight: 10,
          strings: [],
        },
      });
      return photo;
    };
    const startSession = async () => {
      const started = await t.mutation(api.mapping.start, {
        token: tokens.editor,
        projectId,
      });
      if (started.status !== "done") throw new Error("didn't start");
      return started.id as Id<"mappingSessions">;
    };
    const cleanUp = async () => {
      await t.mutation(internal.mapping.cleanUpPhotos, { pageSize: 2 });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    };

    // Five discarded sessions with photos: more than one page of them.
    const discardedPhotos = [await addView(first)];
    await t.mutation(api.mapping.discard, send.editor);
    for (let i = 0; i < 4; i++) {
      const id = await startSession();
      discardedPhotos.push(await addView(id));
      await t.mutation(api.mapping.discard, {
        token: tokens.editor,
        sessionId: id,
      });
    }
    // The newest session is in review, holding its photo.
    const reviewed = await startSession();
    const held = await addView(reviewed);
    await t.mutation(api.mapping.captured, {
      token: tokens.editor,
      sessionId: reviewed,
    });
    await t.mutation(api.mapping.solved, {
      token: tokens.editor,
      sessionId: reviewed,
      proposed: [],
    });

    // On request: only what no view holds.
    const stray = await store();
    expect(
      await t.mutation(api.mapping.deleteUnattached, {
        token: tokens.editor,
        storageIds: [held, stray],
      }),
    ).toBe(1);

    // Daily: the discarded sessions' photos go, the held one stays, and a
    // stray upload goes only once it's a day old.
    const fresh = await store();
    await cleanUp();
    expect(await stored()).toEqual(new Set([held, fresh]));
    expect(await t.query(api.mapping.views, { sessionId: first })).toEqual([]);
    vi.setSystemTime(Date.now() + 25 * 60 * 60_000);
    await cleanUp();
    expect(await stored()).toEqual(new Set([held]));

    // A month on, the discarded sessions' rows go too; the reviewed one stays.
    vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60_000);
    await cleanUp();
    expect(await t.query(api.mapping.get, { sessionId: first })).toBeNull();
    expect(
      (await t.query(api.mapping.get, { sessionId: reviewed }))?.state.kind,
    ).toBe("review");
    expect(await stored()).toEqual(new Set([held]));
    expect(discardedPhotos).toHaveLength(5);
  });

  test("a photo another view holds can't be attached again", async () => {
    const { t, projectId, send } = await setupMapping();
    const photo = await t.run(
      async (ctx) => await ctx.storage.store(new Blob(["jpeg"])),
    );
    const view = (name: string) => ({
      name,
      uploadedAt: 1,
      photo,
      imageWidth: 10,
      imageHeight: 10,
      strings: [],
    });
    await t.mutation(api.mapping.addView, { ...send.editor, view: view("a") });
    // The same view again (a retried upload) is fine.
    await t.mutation(api.mapping.addView, { ...send.editor, view: view("a") });
    // Another view in this session, or in a later one, is refused.
    await expect(
      t.mutation(api.mapping.addView, { ...send.editor, view: view("b") }),
    ).rejects.toThrow(/another view/);
    await t.mutation(api.mapping.discard, send.editor);
    const started = await t.mutation(api.mapping.start, {
      token: tokens.editor,
      projectId,
    });
    if (started.status !== "done") throw new Error("didn't start");
    await expect(
      t.mutation(api.mapping.addView, {
        token: tokens.editor,
        sessionId: started.id as Id<"mappingSessions">,
        view: view("a"),
      }),
    ).rejects.toThrow(/another view/);
    await expect(
      t.mutation(api.mapping.addView, {
        token: tokens.editor,
        sessionId: started.id as Id<"mappingSessions">,
        view: {
          ...view("c"),
          photo: await t.run(
            async (ctx) => await ctx.storage.store(new Blob(["x"])),
          ),
          darkPhoto: photo,
        },
      }),
    ).rejects.toThrow(/another view/);
  });

  test("views are added while capturing, replaced by name, and refused once in review", async () => {
    const { t, sessionId, send } = await setupMapping();
    const upload = async () =>
      await t.run(async (ctx) => await ctx.storage.store(new Blob(["jpeg"])));
    const view = async (name: string, u: number) => ({
      name,
      uploadedAt: 1,
      photo: await upload(),
      imageWidth: 100,
      imageHeight: 50,
      strings: [
        { nodeKey: "s1", points: [{ u, v: 0.5, confidence: 0.9 }, null] },
      ],
    });
    const views = () => t.query(api.mapping.views, { sessionId });

    await t.mutation(api.mapping.addView, {
      ...send.editor,
      view: await view("front", 0.1),
    });
    const replaced = await view("front", 0.2);
    await t.mutation(api.mapping.addView, { ...send.editor, view: replaced });
    await t.mutation(api.mapping.addView, {
      ...send.editor,
      view: await view("side", 0.3),
    });
    const listed = await views();
    expect(listed?.map((v) => [v.name, v.strings[0].points[0]?.u])).toEqual([
      ["front", 0.2],
      ["side", 0.3],
    ]);
    expect(listed?.[0].photoUrl).toBeTruthy();
    // The replaced view's photo is gone from storage.
    expect(
      await t.run(
        async (ctx) => (await ctx.db.system.query("_storage").collect()).length,
      ),
    ).toBe(2);

    await t.mutation(api.mapping.captured, send.editor);
    await t.mutation(api.mapping.solved, { ...send.editor, proposed: [] });
    await expect(
      t.mutation(api.mapping.addView, {
        ...send.editor,
        view: await view("late", 0.4),
      }),
    ).rejects.toThrow(/review/);
  });
});
