import type { Infer } from "convex/values";
import type {
  nodeFieldsValidator,
  playlistFieldsValidator,
  sequenceFieldsValidator,
} from "./schema";
import { findEffectPropsProblem } from "../shared/effects/props";

export { stableStringify } from "../shared/stableStringify";

// The rules editor.sync (convex/editor.ts) applies, as plain functions over a
// project's rows held in memory: what a change may contain, and how
// references are repaired once rows are deleted. No database here.

export type NodeFields = Infer<typeof nodeFieldsValidator>;
export type SequenceFields = Infer<typeof sequenceFieldsValidator>;
export type PlaylistFields = Infer<typeof playlistFieldsValidator>;

export type EditorTable = "nodes" | "sequences" | "playlists";

export type ProjectRows = {
  nodes: Map<string, NodeFields>;
  sequences: Map<string, SequenceFields>;
  playlists: Map<string, PlaylistFields>;
};

/** A row the sync changed without being asked, and why. */
export type Repair = { table: EditorTable; key: string; reason: string };

const MAX_LEDS = 10_000;

const isIndex = (n: number) => Number.isInteger(n) && n >= 0;

/** Why a row can't be saved as it is, judged on its own; null when it can. */
export const findRowProblem = (
  table: EditorTable,
  doc: NodeFields | SequenceFields | PlaylistFields,
): string | null => {
  if (table === "nodes") {
    const node = doc as NodeFields;
    if (node.kind === "string") {
      if (
        !Number.isInteger(node.ledCount) ||
        node.ledCount < 1 ||
        node.ledCount > MAX_LEDS
      )
        return `A string has 1 to ${MAX_LEDS} LEDs, not ${node.ledCount}.`;
      if (node.ledPositions && node.ledPositions.length !== node.ledCount)
        return `The string has ${node.ledCount} LEDs but ${node.ledPositions.length} mapped positions.`;
    }
    if (node.kind === "virtual_string")
      for (const segment of node.segments)
        if (
          !isIndex(segment.fromIndex) ||
          !isIndex(segment.toIndex) ||
          segment.fromIndex > segment.toIndex
        )
          return `A segment runs from LED ${segment.fromIndex} to ${segment.toIndex}: it needs whole numbers, from no more than to.`;
    return null;
  }

  if (table === "sequences") {
    const sequence = doc as SequenceFields;
    if (!(sequence.numFrames >= 1))
      return `A sequence needs at least one frame, not ${sequence.numFrames}.`;
    for (const track of sequence.tracks)
      for (const event of track.events) {
        const problem = findEffectPropsProblem(
          event.kind,
          event.effectDefinitionId,
          event.props,
        );
        if (problem) return problem;
      }
    return null;
  }

  return null;
};

/** Why a virtual string's segments don't fit the strings they point at, or null. */
export const findSegmentRangeProblem = (
  node: NodeFields,
  nodes: ProjectRows["nodes"],
): string | null => {
  if (node.kind !== "virtual_string") return null;
  for (const segment of node.segments) {
    const target = nodes.get(segment.nodeId);
    if (target?.kind !== "string") continue; // dropped by repairReferences
    if (segment.toIndex > target.ledCount - 1)
      return `A segment runs to LED ${segment.toIndex}, past the end of '${target.name}' (${target.ledCount} LEDs, 0 to ${target.ledCount - 1}).`;
  }
  return null;
};

/** Whether following parents from this node comes back to it. */
export const hasParentCycle = (key: string, nodes: ProjectRows["nodes"]) => {
  const seen = new Set<string>([key]);
  let parent = nodes.get(key)?.parentId ?? null;
  while (parent !== null) {
    if (seen.has(parent)) return true;
    seen.add(parent);
    parent = nodes.get(parent)?.parentId ?? null;
  }
  return false;
};

/**
 * Fixes every reference that points at nothing, in place, and says what it
 * changed. `formerParents` has the parent each deleted node had, so a deleted
 * folder's children move up to its parent (or further, if that's gone too).
 * - a node whose parent isn't a folder any more moves to the nearest folder
 *   above it that's still there, or the top level;
 * - a segment on a string that's gone is dropped, and one that runs past the
 *   end of its string (it got shorter) is cut to fit, or dropped if nothing's
 *   left;
 * - appliesTo entries and playlist entries for missing rows are dropped.
 */
export const repairReferences = (
  rows: ProjectRows,
  formerParents: Map<string, string | null>,
): Repair[] => {
  const repairs: Repair[] = [];
  const { nodes, sequences, playlists } = rows;

  const isFolder = (key: string) => nodes.get(key)?.kind === "folder";
  const nearestFolder = (start: string | null) => {
    const seen = new Set<string>();
    let key = start;
    while (key !== null && !isFolder(key) && !seen.has(key)) {
      seen.add(key);
      key = formerParents.get(key) ?? null;
    }
    return key !== null && isFolder(key) ? key : null;
  };

  for (const [key, node] of nodes)
    if (node.parentId !== null && !isFolder(node.parentId)) {
      const parentId = nearestFolder(node.parentId);
      nodes.set(key, { ...node, parentId });
      repairs.push({
        table: "nodes",
        key,
        reason: parentId
          ? `Its folder was deleted, so it moved to ${parentId}.`
          : "Its folder was deleted, so it moved to the top level.",
      });
    }

  for (const [key, node] of nodes) {
    if (node.kind !== "virtual_string") continue;
    const segments = node.segments.flatMap((segment) => {
      const target = nodes.get(segment.nodeId);
      if (target?.kind !== "string") return [];
      const last = target.ledCount - 1;
      if (segment.fromIndex > last) return [];
      return [{ ...segment, toIndex: Math.min(segment.toIndex, last) }];
    });
    if (JSON.stringify(segments) !== JSON.stringify(node.segments)) {
      nodes.set(key, { ...node, segments });
      repairs.push({
        table: "nodes",
        key,
        reason:
          "A string it used was deleted or got shorter, so its segments were trimmed.",
      });
    }
  }

  for (const [key, sequence] of sequences) {
    let dropped = 0;
    const tracks = sequence.tracks.map((track) => ({
      ...track,
      events: track.events.map((event) => {
        if (event.appliesTo.kind !== "nodes") return event;
        const nodeIds = event.appliesTo.nodeIds.filter((id) => nodes.has(id));
        dropped += event.appliesTo.nodeIds.length - nodeIds.length;
        return nodeIds.length === event.appliesTo.nodeIds.length
          ? event
          : { ...event, appliesTo: { kind: "nodes" as const, nodeIds } };
      }),
    }));
    if (dropped > 0) {
      sequences.set(key, { ...sequence, tracks });
      repairs.push({
        table: "sequences",
        key,
        reason: `${dropped} of its effects' nodes were deleted, so they were taken off.`,
      });
    }
  }

  for (const [key, playlist] of playlists) {
    const sequenceIds = playlist.sequenceIds.filter((id) => sequences.has(id));
    if (sequenceIds.length !== playlist.sequenceIds.length) {
      playlists.set(key, { ...playlist, sequenceIds });
      repairs.push({
        table: "playlists",
        key,
        reason: "A sequence on it was deleted, so it came off the playlist.",
      });
    }
  }

  return repairs;
};
