import { defineSchema, defineTable } from "convex/server";
import type { Infer } from "convex/values";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { machineTimers } from "@convex-dev/state-machines";

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
  isReversed: v.optional(v.boolean()),
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

// What the phone remote (ios/) asks the lights to do. HWIR applies it.
export const displayModeValidator = v.union(
  v.object({ kind: v.literal("playlist"), id: v.id("playlists") }),
  v.object({ kind: v.literal("sequence"), id: v.id("sequences") }),
);

export const displaySettingsValidator = v.object({
  isOn: v.boolean(),
  // 0 to 1, multiplied into every LED value HWIR sends.
  brightness: v.number(),
  mode: displayModeValidator,
});

export type DisplaySettings = Infer<typeof displaySettingsValidator>;
export type DisplayMode = Infer<typeof displayModeValidator>;

// The displayControl machine's states (convex/displayControl.ts). Every state
// carries the settings, so HWIR always plays `state.settings`.
export const displayControlState = v.union(
  v.object({
    kind: v.literal("applying"),
    settings: displaySettingsValidator,
    requestedAt: v.number(),
    // When the phone gives up waiting for HWIR to confirm (the TIMED_OUT timer).
    timeoutAt: v.number(),
  }),
  v.object({
    kind: v.literal("live"),
    settings: displaySettingsValidator,
    appliedAt: v.number(),
  }),
  v.object({
    kind: v.literal("unreachable"),
    settings: displaySettingsValidator,
    requestedAt: v.number(),
  }),
);

export default defineSchema({
  // One row per project: the display's on/off, mode and brightness.
  displayControls: defineTable({
    projectId: v.id("projects"),
    state: displayControlState,
    stateTimers: machineTimers,
  }).index("by_project", ["projectId"]),

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
