// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { checkWrites, isLocalUrl } from "./lib/deployment";
import type { Decoded, RunManifest } from "./lib/manifest";
import { uploadView, type ViewStore } from "./lib/upload";

describe("which deployment the tool may change", () => {
  const cloud = "https://aromatic-cardinal-985.convex.cloud";
  const local = "http://127.0.0.1:3212";

  test("local backends are local, cloud ones aren't", () => {
    expect(isLocalUrl(local)).toBe(true);
    expect(isLocalUrl("http://localhost:3210")).toBe(true);
    expect(isLocalUrl(cloud)).toBe(false);
    expect(isLocalUrl("not a url")).toBe(false);
  });

  test("a cloud deployment needs --prod, and says it's the real lights", () => {
    expect(() => checkWrites(cloud, {})).toThrow(/--prod/);
    expect(checkWrites(cloud, { prod: true })).toMatch(/CLOUD/);
    expect(checkWrites(local, {})).toMatch(/local/);
  });

  test("a fake camera never runs against a cloud deployment, even with --prod", () => {
    expect(() =>
      checkWrites(cloud, { prod: true, fake: "synthetic camera" }),
    ).toThrow(/local backend/);
    expect(checkWrites(local, { fake: "synthetic camera" })).toMatch(/local/);
  });
});

describe("upload", () => {
  const dir = mkdtempSync(join(tmpdir(), "mapping-upload-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "reference.jpg"), "jpeg");
  writeFileSync(join(dir, "dark.jpg"), "jpeg");
  const manifest = { view: "front" } as RunManifest;
  const decoded = {
    imageWidth: 10,
    imageHeight: 10,
    strings: [{ key: "s1", points: [null] }],
  } as unknown as Decoded;

  const fakeStore = (state: string | null, addFails = false) => {
    const calls = { uploaded: [] as string[], deleted: [] as string[] };
    const store: ViewStore = {
      get: async () => (state ? { state: { kind: state } } : null),
      uploadFile: async (path) => {
        const id = `file-${calls.uploaded.length}`;
        calls.uploaded.push(path);
        return id;
      },
      addView: async () => {
        if (addFails) throw new Error("The session is discarded");
      },
      deleteUnattached: async (ids) => {
        calls.deleted.push(...ids);
      },
    };
    return { store, calls };
  };
  const args = { runDir: dir, sessionId: "s", manifest, decoded };

  test("uploads nothing when the session doesn't take views", async () => {
    for (const state of ["discarded", "review", null]) {
      const { store, calls } = fakeStore(state);
      await expect(uploadView(store, args)).rejects.toThrow(
        /capturing or solving/,
      );
      expect(calls.uploaded).toEqual([]);
    }
  });

  test("deletes its photos again when attaching them fails", async () => {
    const { store, calls } = fakeStore("capturing", true);
    await expect(uploadView(store, args)).rejects.toThrow(/discarded/);
    expect(calls.uploaded).toHaveLength(2);
    expect(calls.deleted).toEqual(["file-0", "file-1"]);
  });

  test("attaches the reference and dark photos", async () => {
    const { store, calls } = fakeStore("solving");
    expect(await uploadView(store, args)).toEqual({
      reference: "reference.jpg",
    });
    expect(calls.deleted).toEqual([]);
  });
});
