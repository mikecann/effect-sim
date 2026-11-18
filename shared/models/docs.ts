import type { Doc } from "../../convex/_generated/dataModel";

// The editor's rows as its models hold them: the database doc without
// Convex's system fields. Rows are known by `key` (convex/schema.ts), which
// the editor makes for new ones (newKey), so a row has its identity before
// it's ever saved.

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type EditorTable = "nodes" | "sequences" | "playlists";

export type EditorDoc<T extends EditorTable> = DistributiveOmit<
  Doc<T>,
  "_id" | "_creationTime"
>;

export type NodeDoc = EditorDoc<"nodes">;
export type NodeDocKinds = NodeDoc["kind"];
export type NodeDocOfKind<K extends NodeDocKinds> = Extract<NodeDoc, { kind: K }>;
export type SequenceDoc = EditorDoc<"sequences">;
export type PlaylistDoc = EditorDoc<"playlists">;

/** A node's, sequence's or playlist's key. */
export type NodeKey = string;
export type SequenceKey = string;
export type PlaylistKey = string;

/** A new row's key. */
export const newKey = (): string => crypto.randomUUID();

/** A doc from the database as the editor holds it. */
export const toEditorDoc = <T extends EditorTable>(
  doc: Doc<T>,
): EditorDoc<T> => {
  const { _id, _creationTime, ...rest } = doc;
  return rest as EditorDoc<T>;
};
