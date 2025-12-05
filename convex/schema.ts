import { defineSchema, defineTable } from "convex/server";
import type { Infer } from "convex/values";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";

export const appliesToValidator = v.union(
  v.object({ kind: v.literal("nodes"), nodeIds: v.array(v.id("nodes")) }),
  v.object({ kind: v.literal("all_nodes") }),
);

const commonTrackEventFields = {
  id: v.string(),
  startFrame: v.number(),
  endFrame: v.number(),
};

export const trackEventValidator = v.union(
  v.object({
    ...commonTrackEventFields,
    kind: v.literal("string_effect"),
    effectDefinitionId: v.string(),
    appliesTo: appliesToValidator,
    props: v.optional(v.any()),
  }),
  v.object({
    ...commonTrackEventFields,
    kind: v.literal("switch_effect"),
    effectDefinitionId: v.string(),
    appliesTo: appliesToValidator,
    props: v.optional(v.any()),
  }),
);

export const trackValidator = v.object({
  id: v.string(),
  name: v.string(),
  events: v.array(trackEventValidator),
});

export type TrackEvent = Infer<typeof trackEventValidator>;
export type Track = Infer<typeof trackValidator>;

export const iconValidator = v.union(
  v.object({
    kind: v.literal("emoji"),
    emoji: v.string(),
  }),
);

export const commonNodeFields = {
  order: v.number(),
  parentId: v.union(v.id("nodes"), v.null()),
  projectId: v.id("projects"),
};

export const stringNodeFields = {
  kind: v.literal("string"),
  name: v.string(),
  icon: iconValidator,
  spacingMeters: v.number(),
  ledCount: v.number(),
  ipAddress: v.string(),
  port: v.number(),
  brightness: v.number(),
  pathPoints: v.array(
    v.object({
      position: v.object({
        x: v.number(),
        y: v.number(),
        z: v.number(),
      }),
    }),
  ),
};

export const switchNodeFields = {
  kind: v.literal("switch"),
  name: v.string(),
  icon: iconValidator,
  ipAddress: v.string(),
  isOn: v.union(v.boolean(), v.null()),
  apiType: v.optional(
    v.union(v.literal("athom_type1"), v.literal("athom_type2")),
  ),
};

export const segmentValidator = v.object({
  nodeId: v.id("nodes"),
  fromIndex: v.number(),
  toIndex: v.number(),
});

export const virtualStringNodeFields = {
  kind: v.literal("virtual_string"),
  name: v.string(),
  icon: iconValidator,
  segments: v.array(segmentValidator),
};

export const folderNodeFields = {
  kind: v.literal("folder"),
  label: v.string(),
  children: v.array(v.id("nodes")),
};

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    settings: v.object({
      nightMode: v.boolean(),
      lightsOnTop: v.boolean(),
      stringLedSize: v.optional(v.number()),
      cameraControl: v.optional(
        v.union(
          v.literal("orbit"),
          v.literal("fly"),
          v.literal("first_person"),
        ),
      ),
      defaultFramerate: v.optional(v.number()),
    }),
  }),

  nodes: defineTable(
    v.union(
      v.object({
        ...commonNodeFields,
        ...stringNodeFields,
      }),
      v.object({
        ...commonNodeFields,
        ...folderNodeFields,
      }),
      v.object({
        ...commonNodeFields,
        ...switchNodeFields,
      }),
      v.object({
        ...commonNodeFields,
        ...virtualStringNodeFields,
      }),
    ),
  )
    .index("by_kind", ["kind"])
    .index("by_parent", ["parentId", "order"])
    .index("by_project", ["projectId"])
    .index("by_kind_project", ["kind", "projectId"]),

  sequences: defineTable({
    name: v.string(),
    numFrames: v.number(),
    tracks: v.array(trackValidator),
    projectId: v.id("projects"),
  }).index("by_project", ["projectId"]),

  playlists: defineTable({
    name: v.string(),
    sequenceIds: v.array(v.id("sequences")),
    projectId: v.id("projects"),
  }).index("by_project", ["projectId"]),
});

export type NodeDoc = Doc<"nodes">;
export type NodeDocKinds = NodeDoc["kind"];
export type NodeDocOfKind<K extends NodeDocKinds> = Extract<
  NodeDoc,
  { kind: K }
>;
