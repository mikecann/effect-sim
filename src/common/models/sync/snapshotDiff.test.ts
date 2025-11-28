import { describe, expect, it } from "vitest";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { diffTable } from "./snapshotDiff";
import type { Doc } from "../../../../convex/_generated/dataModel";

describe("diffTable", () => {
  it("should return no operations when arrays are identical", () => {
    const projects: Array<Doc<"projects">> = [
      {
        _id: "project1" as any,
        _creationTime: 1000,
        name: "Test Project",
        settings: { nightMode: false, lightsOnTop: true },
      },
    ];
    const operations = diffTable(projects, projects);
    expect(operations).toEqual([]);
  });

  it("should detect a project property change (patch)", () => {
    const prev: Array<Doc<"projects">> = [
      {
        _id: "project1" as any,
        _creationTime: 1000,
        name: "Old Name",
        settings: { nightMode: false, lightsOnTop: true },
      },
    ];
    const curr: Array<Doc<"projects">> = [
      {
        _id: "project1" as any,
        _creationTime: 1000,
        name: "New Name",
        settings: { nightMode: false, lightsOnTop: true },
      },
    ];

    const operations = diffTable(prev, curr);

    expect(operations).toHaveLength(1);
    expect(operations[0]).toEqual({
      kind: "patch",
      id: "project1",
      values: {
        name: "New Name",
        settings: { nightMode: false, lightsOnTop: true },
      },
    });
  });

  it("should detect an added playlist (insert)", () => {
    const prev: Array<Doc<"playlists">> = [];
    const curr: Array<Doc<"playlists">> = [
      {
        _id: "playlist1" as any,
        _creationTime: 1001,
        name: "My Playlist",
        projectId: "project1" as any,
        sequenceIds: [],
      },
    ];

    const operations = diffTable(prev, curr);

    expect(operations).toHaveLength(1);
    expect(operations[0]).toEqual({
      kind: "insert",
      tempId: "playlist1",
      values: {
        name: "My Playlist",
        projectId: "project1",
        sequenceIds: [],
      },
    });
  });

  it("should detect a removed playlist (delete)", () => {
    const prev: Array<Doc<"playlists">> = [
      {
        _id: "playlist1" as any,
        _creationTime: 1001,
        name: "My Playlist",
        projectId: "project1" as any,
        sequenceIds: [],
      },
    ];
    const curr: Array<Doc<"playlists">> = [];

    const operations = diffTable(prev, curr);

    expect(operations).toHaveLength(1);
    expect(operations[0]).toEqual({
      kind: "delete",
      id: "playlist1",
    });
  });

  it("should detect a changed playlist (patch)", () => {
    const prev: Array<Doc<"playlists">> = [
      {
        _id: "playlist1" as any,
        _creationTime: 1001,
        name: "Old Playlist Name",
        projectId: "project1" as any,
        sequenceIds: [],
      },
    ];
    const curr: Array<Doc<"playlists">> = [
      {
        _id: "playlist1" as any,
        _creationTime: 1001,
        name: "New Playlist Name",
        projectId: "project1" as any,
        sequenceIds: [],
      },
    ];

    const operations = diffTable(prev, curr);

    expect(operations).toHaveLength(1);
    expect(operations[0]).toEqual({
      kind: "patch",
      id: "playlist1",
      values: {
        name: "New Playlist Name",
        projectId: "project1",
        sequenceIds: [],
      },
    });
  });

  it("should handle multiple changes (delete, insert, patch)", () => {
    const prev: Array<Doc<"nodes">> = [
      {
        _id: "node1" as any,
        _creationTime: 1002,
        kind: "string" as any,
        name: "Node 1",
        icon: { kind: "emoji" as const, emoji: "1️⃣" },
        order: 0,
        parentId: null,
        projectId: "project1" as any,
        spacingMeters: 0.1,
        ledCount: 100,
        ipAddress: "192.168.1.1",
        port: 21324,
        brightness: 128,
        pathPoints: [],
      },
      {
        _id: "node2" as any,
        _creationTime: 1003,
        kind: "string" as any,
        name: "Node 2",
        icon: { kind: "emoji" as const, emoji: "2️⃣" },
        order: 1,
        parentId: null,
        projectId: "project1" as any,
        spacingMeters: 0.1,
        ledCount: 100,
        ipAddress: "192.168.1.2",
        port: 21324,
        brightness: 128,
        pathPoints: [],
      },
    ];

    const curr: Array<Doc<"nodes">> = [
      {
        _id: "node1" as any,
        _creationTime: 1002,
        kind: "string" as any,
        name: "Node 1 Updated",
        icon: { kind: "emoji" as const, emoji: "1️⃣" },
        order: 0,
        parentId: null,
        projectId: "project1" as any,
        spacingMeters: 0.1,
        ledCount: 100,
        ipAddress: "192.168.1.1",
        port: 21324,
        brightness: 128,
        pathPoints: [],
      },
      {
        _id: "node3" as any,
        _creationTime: 1004,
        kind: "string" as any,
        name: "Node 3",
        icon: { kind: "emoji" as const, emoji: "3️⃣" },
        order: 2,
        parentId: null,
        projectId: "project1" as any,
        spacingMeters: 0.1,
        ledCount: 100,
        ipAddress: "192.168.1.3",
        port: 21324,
        brightness: 128,
        pathPoints: [],
      },
    ];

    const operations = diffTable(prev, curr);

    // Expected: delete node2, insert node3, patch node1
    const deleteOp = operations.find((op) => op.kind === "delete");
    const insertOp = operations.find((op) => op.kind === "insert");
    const patchOp = operations.find((op) => op.kind === "patch");

    expect(operations).toHaveLength(3);

    expect(deleteOp).toEqual({
      kind: "delete",
      id: "node2",
    });

    expect(insertOp?.kind).toBe("insert");
    expect(insertOp?.tempId).toBe("node3");
    expect((insertOp as any)?.values?.name).toBe("Node 3");

    expect(patchOp?.kind).toBe("patch");
    expect(patchOp?.id).toBe("node1");
    expect((patchOp as any)?.values?.name).toBe("Node 1 Updated");
  });

  it("should handle models in table-based structure", () => {
    // With the new structure, all models are in their respective tables
    const prev: Array<Doc<"nodes">> = [
      {
        _id: "node1" as any,
        _creationTime: 1002,
        kind: "string" as any,
        name: "Test",
        icon: { kind: "emoji" as const, emoji: "1️⃣" },
        order: 0,
        parentId: null,
        projectId: "project1" as any,
        spacingMeters: 0.1,
        ledCount: 100,
        ipAddress: "192.168.1.1",
        port: 21324,
        brightness: 128,
        pathPoints: [],
      },
    ];

    const curr: Array<Doc<"nodes">> = [];

    const operations = diffTable(prev, curr);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toEqual({
      kind: "delete",
      id: "node1",
    });
  });

  it("should ignore changes if JSON.stringify matches", () => {
    const projects: Array<Doc<"projects">> = [
      {
        _id: "project1" as any,
        _creationTime: 1000,
        name: "Test Project",
        settings: { nightMode: false, lightsOnTop: true },
      },
    ];

    // Even if they are different object references, same content should yield no ops
    const operations = diffTable(projects, [...projects]);
    expect(operations).toEqual([]);
  });

  it("should correctly diff sequences", () => {
    const prev: Array<Doc<"sequences">> = [];
    const curr: Array<Doc<"sequences">> = [
      {
        _id: "seq1" as any,
        _creationTime: 1005,
        name: "Test Sequence",
        projectId: "project1" as any,
        numFrames: 100,
        tracks: [],
      },
    ];

    const operations = diffTable(prev, curr);

    expect(operations).toHaveLength(1);
    expect(operations[0].kind).toBe("insert");
  });
});
