import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { register } from "@convex-dev/state-machines/test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const tokens = { editor: "e-token", hwir: "h-token", remote: "r-token" };

beforeEach(() => {
  vi.stubEnv("EDITOR_TOKEN", tokens.editor);
  vi.stubEnv("HWIR_TOKEN", tokens.hwir);
  vi.stubEnv("REMOTE_TOKEN", tokens.remote);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const setup = async () => {
  const t = convexTest(schema, modules);
  register(t);
  const projectId = await t.mutation(api.editor.createProject, {
    token: tokens.editor,
    name: "House",
  });
  await t.mutation(api.display.boot, {
    token: tokens.hwir,
    projectId,
    settings: {
      isOn: true,
      brightness: 1,
      mode: { kind: "playlist", id: "p" },
    },
  });
  return { t, projectId };
};

describe("tokens", () => {
  test("the right token is let in", async () => {
    const { t, projectId } = await setup();
    const result = await t.mutation(api.editor.sync, {
      token: tokens.editor,
      projectId,
      changes: [],
    });
    expect(result.applied).toBe(0);
  });

  test("a wrong token is refused, whether or not tokens are required", async () => {
    const { t, projectId } = await setup();
    await expect(
      t.mutation(api.editor.sync, { token: "guess", projectId, changes: [] }),
    ).rejects.toThrow(/isn't the editor token/);
    vi.stubEnv("REQUIRE_TOKENS", "true");
    await expect(
      t.mutation(api.editor.sync, { token: "guess", projectId, changes: [] }),
    ).rejects.toThrow(/isn't the editor token/);
  });

  test("another role's token is refused", async () => {
    const { t, projectId } = await setup();
    await expect(
      t.mutation(api.editor.sync, {
        token: tokens.hwir,
        projectId,
        changes: [],
      }),
    ).rejects.toThrow(/isn't the editor token/);
    await expect(
      t.mutation(api.display.request, {
        token: tokens.editor,
        projectId,
        isOn: false,
      }),
    ).rejects.toThrow(/isn't the remote token/);
    await expect(
      t.mutation(api.display.applied, {
        token: tokens.remote,
        projectId,
        requestedAt: 1,
      }),
    ).rejects.toThrow(/isn't the hwir token/);
  });

  test("a token is refused when its env var isn't set", async () => {
    const { t, projectId } = await setup();
    vi.stubEnv("EDITOR_TOKEN", "");
    await expect(
      t.mutation(api.editor.sync, {
        token: tokens.editor,
        projectId,
        changes: [],
      }),
    ).rejects.toThrow(/isn't the editor token/);
  });

  test("no token is let in, with a warning, until REQUIRE_TOKENS is true", async () => {
    const { t, projectId } = await setup();
    const result = await t.mutation(api.display.request, {
      projectId,
      isOn: false,
    });
    expect(result).toMatchObject({ status: "done", to: "applying" });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("came without a token"),
    );

    vi.stubEnv("REQUIRE_TOKENS", "true");
    await expect(
      t.mutation(api.display.request, { projectId, isOn: true }),
    ).rejects.toThrow(/needs the remote token/);
    await expect(
      t.mutation(api.editor.sync, { projectId, changes: [] }),
    ).rejects.toThrow(/needs the editor token/);
    await expect(
      t.mutation(api.hwir.heartbeat, {
        projectId,
        commit: "abc",
        fps: 15,
        strings: [],
      }),
    ).rejects.toThrow(/needs the hwir token/);
  });

  test("functions open to two roles take either token", async () => {
    const { t, projectId } = await setup();
    await t.mutation(api.editor.sync, {
      token: tokens.editor,
      projectId,
      changes: [
        {
          table: "nodes",
          op: "create",
          key: "sw",
          doc: {
            kind: "switch",
            name: "Sign",
            icon: { kind: "emoji", emoji: "1️⃣" },
            ipAddress: "10.0.0.3",
            parentId: null,
            order: 0,
          },
        },
      ],
    });
    for (const token of [tokens.hwir, tokens.editor])
      expect(
        await t.mutation(api.switches.switching, {
          token,
          projectId,
          nodeKey: "sw",
          on: true,
        }),
      ).toMatchObject({ status: "done" });
    await expect(
      t.mutation(api.switches.switching, {
        token: tokens.remote,
        projectId,
        nodeKey: "sw",
        on: true,
      }),
    ).rejects.toThrow(/isn't the hwir or editor token/);
  });
});
