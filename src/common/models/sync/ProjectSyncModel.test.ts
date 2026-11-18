import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { ProjectData } from "../../../../convex/functions";
import { ProjectModel } from "../../../../shared/models/ProjectModel";
import {
  orderForBatches,
  ProjectSyncModel,
  SYNC_DEBOUNCE_MS,
  type SyncChange,
  type SyncResult,
} from "./ProjectSyncModel";

const projectId = "p1" as Id<"projects">;
const projectDoc: Doc<"projects"> = {
  _id: projectId,
  _creationTime: 0,
  name: "House",
  settings: { nightMode: true, lightsOnTop: true },
};

const folder = (key: string, label: string) =>
  ({
    _id: `id-${key}`,
    _creationTime: 0,
    projectId,
    key,
    kind: "folder",
    label,
    parentId: null,
    order: 0,
  }) as Doc<"nodes">;

const data = (...nodes: Doc<"nodes">[]): ProjectData => ({
  nodes,
  sequences: [],
  playlists: [],
});

const ok = (applied: number): SyncResult => ({
  applied,
  skipped: [],
  rejected: [],
  repaired: [],
});

type Pending = {
  changes: SyncChange[];
  resolve: (r: SyncResult) => void;
  reject: (e: unknown) => void;
};

const setup = () => {
  const project = new ProjectModel(projectDoc);
  const calls: Pending[] = [];
  const send = (changes: SyncChange[]) =>
    new Promise<SyncResult>((resolve, reject) =>
      calls.push({ changes, resolve, reject }),
    );
  const sync = new ProjectSyncModel(project, send);
  sync.start();
  sync.applyServerData(
    data(folder("a", "A"), folder("b", "B")),
    projectDoc,
    true,
  );
  const label = (key: string) => {
    const node = project.findNode(key);
    return node?.kind === "folder" ? node.label : undefined;
  };
  return { project, sync, calls, label };
};

const tick = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ProjectSyncModel", () => {
  it("loads the server's rows and has nothing to save", async () => {
    const { sync, calls, label } = setup();
    await tick(SYNC_DEBOUNCE_MS * 2);
    expect(label("a")).toBe("A");
    expect(calls).toHaveLength(0);
    expect(sync.status).toEqual({ kind: "saved" });
  });

  it("batches edits, and never has two batches in flight", async () => {
    const { project, sync, calls } = setup();
    const a = project.findNode("a");
    if (a?.kind !== "folder") throw new Error("no a");
    a.setLabel("A1");
    a.setLabel("A2");
    expect(sync.status).toEqual({ kind: "saving" });
    await tick(SYNC_DEBOUNCE_MS);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.changes).toEqual([
      {
        table: "nodes",
        op: "update",
        key: "a",
        doc: { kind: "folder", label: "A2", parentId: null, order: 0 },
      },
    ]);

    // Edits while the batch is out wait for it.
    a.setLabel("A3");
    project.createFolderNode({ label: "C" });
    await tick(SYNC_DEBOUNCE_MS * 4);
    expect(calls).toHaveLength(1);

    calls[0]?.resolve(ok(1));
    await tick(SYNC_DEBOUNCE_MS);
    expect(calls).toHaveLength(2);
    expect(
      calls[1]?.changes.map((c) => `${c.op}:${"key" in c ? c.key : ""}`).sort(),
    ).toEqual([expect.stringMatching(/^create:/), "update:a"]);
    calls[1]?.resolve(ok(2));
    await tick(0);
    expect(sync.status).toEqual({ kind: "saved" });
    expect(sync.hasUnsavedChanges()).toBe(false);
  });

  it("takes server changes to rows with no unsaved edits, and keeps unsaved ones", async () => {
    const { project, sync, label } = setup();
    const a = project.findNode("a");
    if (a?.kind !== "folder") throw new Error("no a");
    a.setLabel("mine");
    sync.applyServerData(
      data(folder("a", "theirs"), folder("b", "B2"), folder("c", "C")),
      projectDoc,
      true,
    );
    expect(label("a")).toBe("mine");
    expect(label("b")).toBe("B2");
    expect(label("c")).toBe("C");

    sync.applyServerData(data(folder("a", "theirs")), projectDoc, true);
    expect(project.findNode("b")).toBeNull();
  });

  it("puts a rejected change back to the server's version", async () => {
    const { project, calls, label } = setup();
    const b = project.findNode("b");
    if (b?.kind !== "folder") throw new Error("no b");
    b.setLabel("bad");
    await tick(SYNC_DEBOUNCE_MS);
    calls[0]?.resolve({
      ...ok(0),
      rejected: [{ table: "nodes", key: "b", reason: "no" }],
    });
    await tick(0);
    expect(label("b")).toBe("B");
  });

  it("says when a batch fails, and tries again", async () => {
    const { project, sync, calls } = setup();
    const a = project.findNode("a");
    if (a?.kind !== "folder") throw new Error("no a");
    a.setLabel("A1");
    await tick(SYNC_DEBOUNCE_MS);
    calls[0]?.reject(new Error("offline"));
    await tick(0);
    expect(sync.status).toMatchObject({ kind: "error", message: "offline" });
    await tick(2_000);
    expect(calls).toHaveLength(2);
    calls[1]?.resolve(ok(1));
    await tick(0);
    expect(sync.status).toEqual({ kind: "saved" });
  });

  it("reopening a project drops the old rows and takes the server's, sending nothing stale", async () => {
    const { project, sync, calls, label } = setup();
    sync.close();
    // Another tab renames a and deletes b while the project is closed.
    const reopened = new ProjectSyncModel(project, async (changes) => {
      calls.push({ changes, resolve: () => {}, reject: () => {} });
      return ok(0);
    });
    reopened.start();
    expect(project.nodes).toEqual([]);
    reopened.applyServerData(
      data(folder("a", "A (other tab)")),
      projectDoc,
      true,
    );
    await tick(SYNC_DEBOUNCE_MS * 2);
    expect(label("a")).toBe("A (other tab)");
    expect(project.findNode("b")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("closing sends the last edits at once", async () => {
    const { project, sync, calls } = setup();
    const a = project.findNode("a");
    if (a?.kind !== "folder") throw new Error("no a");
    a.setLabel("last edit");
    sync.close();
    await tick(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.changes[0]).toMatchObject({ op: "update", key: "a" });
  });

  it("a row deleted elsewhere goes, even if edited while its update was out", async () => {
    const { project, sync, calls } = setup();
    const b = project.findNode("b");
    if (b?.kind !== "folder") throw new Error("no b");
    b.setLabel("B1");
    await tick(SYNC_DEBOUNCE_MS);
    b.setLabel("B2"); // edited again while the update is out
    sync.applyServerData(data(folder("a", "A")), projectDoc, true); // deleted elsewhere
    calls[0]?.resolve({
      ...ok(0),
      skipped: [
        {
          table: "nodes",
          key: "b",
          reason: "It was deleted, so the change was dropped.",
        },
      ],
    });
    await tick(SYNC_DEBOUNCE_MS * 4);
    expect(project.findNode("b")).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("never sends a row too big to store, and still saves the rest", async () => {
    const { project, sync, calls, label } = setup();
    const a = project.findNode("a");
    const b = project.findNode("b");
    if (a?.kind !== "folder" || b?.kind !== "folder") throw new Error("no a/b");
    a.setLabel("x".repeat(1_000_000));
    b.setLabel("B1");
    await tick(SYNC_DEBOUNCE_MS);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.changes.map((c) => ("key" in c ? c.key : ""))).toEqual([
      "b",
    ]);
    expect(label("a")).toBe("A");
    expect(sync.lastProblems[0]).toMatchObject({ key: "a" });
  });

  it("closing with unsaved edits sends them once, then stops", async () => {
    const { project, sync, calls } = setup();
    const a = project.findNode("a");
    if (a?.kind !== "folder") throw new Error("no a");
    a.setLabel("renamed"); // and the project closes before the debounce
    sync.close();
    await tick(0);
    expect(calls).toHaveLength(1);
    calls[0]?.resolve(ok(1));
    // Reopening clears the shared rows; the closed syncer mustn't read them.
    project.clearRows();
    await tick(SYNC_DEBOUNCE_MS * 20);
    expect(calls).toHaveLength(1);
  });

  it("closing while a batch is out sends the rest after it, once", async () => {
    const { project, sync, calls } = setup();
    const a = project.findNode("a");
    const b = project.findNode("b");
    if (a?.kind !== "folder" || b?.kind !== "folder") throw new Error("no a/b");
    a.setLabel("A1");
    await tick(SYNC_DEBOUNCE_MS);
    expect(calls).toHaveLength(1);
    b.setLabel("B1");
    sync.close();
    project.clearRows();
    calls[0]?.resolve(ok(1));
    await tick(0);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.changes.map((c) => ("key" in c ? c.key : ""))).toContain(
      "b",
    );
    calls[1]?.resolve(ok(2));
    await tick(SYNC_DEBOUNCE_MS * 20);
    expect(calls).toHaveLength(2);
  });

  it("orders changes so a batch never refers to a row a later batch creates", () => {
    const node = (key: string, doc: Record<string, unknown>) =>
      ({ table: "nodes", op: "create", key, doc }) as SyncChange;
    const ordered = orderForBatches([
      { table: "nodes", op: "delete", key: "gone" },
      {
        table: "playlists",
        op: "create",
        key: "p",
        doc: { name: "P", sequenceIds: ["q"] },
      },
      {
        table: "sequences",
        op: "create",
        key: "q",
        doc: { name: "Q", numFrames: 1, tracks: [] },
      },
      node("v", { kind: "virtual_string", parentId: "inner" }),
      node("inner", { kind: "folder", parentId: "outer" }),
      node("s", { kind: "string", parentId: "inner" }),
      node("outer", { kind: "folder", parentId: null }),
      {
        table: "nodes",
        op: "update",
        key: "old",
        doc: { kind: "folder", parentId: "outer" },
      } as SyncChange,
    ]);
    expect(ordered.map((c) => ("key" in c ? c.key : ""))).toEqual([
      "outer",
      "inner",
      "s",
      "v",
      "old",
      "q",
      "p",
      "gone",
    ]);
  });
});
