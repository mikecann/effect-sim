import { defineSchema, defineTable } from "convex/server";
import type { Infer } from "convex/values";
import { v } from "convex/values";
import { machineTimers } from "@convex-dev/state-machines";

// The editor owns nodes, sequences and playlists. Each has a `key`, the
// editor's own id for it (crypto.randomUUID() for new rows, the old _id string
// for rows from before the rebuild), and every reference between them holds a
// key: parentId, segments[].nodeId, appliesTo.nodeIds, sequenceIds, the
// display's mode id. The fields kept their names from when they held Convex
// ids. The editor writes them all through one mutation, editor.sync
// (convex/editor.ts).

export const appliesToValidator = v.union(
  v.object({ kind: v.literal("nodes"), nodeIds: v.array(v.string()) }),
  v.object({ kind: v.literal("all_nodes") }),
);

const commonTrackEventFields = {
  id: v.string(),
  startFrame: v.number(),
  endFrame: v.number(),
  effectDefinitionId: v.string(),
  appliesTo: appliesToValidator,
  // Checked against the effect's zod schema (shared/effects/props.ts) by
  // editor.sync, as Convex validators can't say "whatever this effect takes".
  props: v.optional(v.any()),
};

export const trackEventValidator = v.union(
  // eslint-disable-next-line machines/no-optional-on-machine-tables -- not a machine's state: a track event's `kind` is which sort of effect it is, and props are optional.
  v.object({ ...commonTrackEventFields, kind: v.literal("string_effect") }),
  v.object({ ...commonTrackEventFields, kind: v.literal("switch_effect") }),
);

export const trackValidator = v.object({
  id: v.string(),
  name: v.string(),
  events: v.array(trackEventValidator),
});

export type TrackEvent = Infer<typeof trackEventValidator>;
export type Track = Infer<typeof trackValidator>;

export const iconValidator = v.object({
  kind: v.literal("emoji"),
  emoji: v.string(),
});

export const pointValidator = v.object({
  x: v.number(),
  y: v.number(),
  z: v.number(),
});

export type Point = Infer<typeof pointValidator>;

// Where a node sits in the tree. parentId is a folder's key, or null at the top.
const treeFields = {
  order: v.number(),
  parentId: v.union(v.string(), v.null()),
};

const stringNodeFields = {
  ...treeFields,
  kind: v.literal("string"),
  name: v.string(),
  icon: iconValidator,
  spacingMeters: v.number(),
  ledCount: v.number(),
  ipAddress: v.string(),
  port: v.number(),
  brightness: v.number(),
  // The path drawn by hand in the editor; LEDs are spaced along it.
  pathPoints: v.array(v.object({ position: pointValidator })),
  // One per LED, from camera mapping (convex/mappingSession.ts). When there,
  // the editor and effects use them as they are, instead of the path.
  ledPositions: v.optional(v.array(pointValidator)),
};

const switchNodeFields = {
  ...treeFields,
  kind: v.literal("switch"),
  name: v.string(),
  icon: iconValidator,
  ipAddress: v.string(),
  apiType: v.optional(
    v.union(v.literal("athom_type1"), v.literal("athom_type2")),
  ),
};

export const segmentValidator = v.object({
  // A string node's key.
  nodeId: v.string(),
  // Inclusive LED indexes on that string, 0 to ledCount - 1.
  fromIndex: v.number(),
  toIndex: v.number(),
  isReversed: v.optional(v.boolean()),
});

const virtualStringNodeFields = {
  ...treeFields,
  kind: v.literal("virtual_string"),
  name: v.string(),
  icon: iconValidator,
  segments: v.array(segmentValidator),
};

const folderNodeFields = {
  ...treeFields,
  kind: v.literal("folder"),
  label: v.string(),
};

// A node as the editor sends it to editor.sync: everything but its project
// and key, which the change carries.
export const nodeFieldsValidator = v.union(
  v.object(stringNodeFields),
  v.object(folderNodeFields),
  v.object(switchNodeFields),
  v.object(virtualStringNodeFields),
);

export const sequenceFields = {
  name: v.string(),
  numFrames: v.number(),
  tracks: v.array(trackValidator),
};
export const sequenceFieldsValidator = v.object(sequenceFields);

export const playlistFields = {
  name: v.string(),
  // Sequence keys, in play order. One can appear more than once.
  sequenceIds: v.array(v.string()),
};
export const playlistFieldsValidator = v.object(playlistFields);

export const projectSettingsValidator = v.object({
  nightMode: v.boolean(),
  lightsOnTop: v.boolean(),
  stringLedSize: v.optional(v.number()),
  cameraControl: v.optional(
    v.union(v.literal("orbit"), v.literal("fly"), v.literal("first_person")),
  ),
  defaultFramerate: v.optional(v.number()),
});
export const projectFields = {
  name: v.string(),
  settings: projectSettingsValidator,
};
export const projectFieldsValidator = v.object(projectFields);

const owned = { projectId: v.id("projects"), key: v.string() };

// What the phone remote (ios/) asks the lights to play. `id` is the
// playlist's or sequence's key.
export const playbackModeValidator = v.union(
  v.object({ kind: v.literal("playlist"), id: v.string() }),
  v.object({ kind: v.literal("sequence"), id: v.string() }),
);

// Mapping: HWIR shows a mapping session's patterns (convex/mappingSession.ts)
// instead of playing, then goes back to `returnTo`. `id` is the session's _id.
export const displayModeValidator = v.union(
  v.object({ kind: v.literal("playlist"), id: v.string() }),
  v.object({ kind: v.literal("sequence"), id: v.string() }),
  v.object({
    kind: v.literal("mapping"),
    id: v.id("mappingSessions"),
    returnTo: playbackModeValidator,
  }),
);

export const displaySettingsValidator = v.object({
  isOn: v.boolean(),
  // 0 to 1, multiplied into every LED value HWIR sends.
  brightness: v.number(),
  mode: displayModeValidator,
});

export type DisplaySettings = Infer<typeof displaySettingsValidator>;
export type DisplayMode = Infer<typeof displayModeValidator>;
export type PlaybackMode = Infer<typeof playbackModeValidator>;

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

// A switch node's power, as last heard from the plug (convex/switchState.ts).
export const switchStateValidator = v.union(
  v.object({ kind: v.literal("unknown") }),
  v.object({
    kind: v.literal("switching"),
    target: v.boolean(),
    // When it gives up waiting for the plug to answer.
    timeoutAt: v.number(),
  }),
  v.object({ kind: v.literal("on"), changedAt: v.number() }),
  v.object({ kind: v.literal("off"), changedAt: v.number() }),
  v.object({
    kind: v.literal("unreachable"),
    error: v.string(),
    changedAt: v.number(),
  }),
  v.object({ kind: v.literal("removed") }),
);

// How each string's connection is doing, as HWIR reports it.
export const stringConnectionValidator = v.union(
  v.literal("connecting"),
  v.literal("live"),
  v.literal("degraded"),
  v.literal("offline"),
);

export const hwirStringStatusValidator = v.object({
  key: v.string(),
  connection: stringConnectionValidator,
  // When the string last answered HWIR's probe (absent: not since HWIR
  // started). Per string, not per presence state.
  // eslint-disable-next-line machines/no-optional-on-machine-tables -- heartbeat data about a string, unrelated to whether HWIR is online
  lastSeenAt: v.optional(v.number()),
});

// The display's mains plug (Home Assistant), as HWIR last switched it. When a
// switch fails HWIR still plays and confirms the LED side, retries the plug,
// and reports it here.
export const hwirPlugStatusValidator = v.object({
  ok: v.boolean(),
  // What HWIR switched it to, or is trying to.
  on: v.boolean(),
  // Since when it's been ok, or failing.
  since: v.number(),
  error: v.optional(v.string()),
});

// Whether HWIR is running (convex/hwirPresence.ts), from its heartbeat.
export const hwirPresenceState = v.union(
  v.object({
    kind: v.literal("online"),
    since: v.number(),
    lastSeenAt: v.number(),
    // A heartbeat is due every 10 s; past this it's stale.
    staleAt: v.number(),
  }),
  v.object({
    kind: v.literal("stale"),
    lastSeenAt: v.number(),
    offlineAt: v.number(),
  }),
  v.object({ kind: v.literal("offline"), lastSeenAt: v.number() }),
);

// What a mapping session asks HWIR to light, for the camera to photograph.
// - off / all: every string dark, or every LED lit;
// - string: one string's LEDs, the rest dark;
// - led: one LED;
// - ranges: runs of LEDs, `from` to `to` inclusive, each on its own string
//   (blocks of gap LEDs, lit together where the camera can tell them apart);
// - bit: every LED whose index has this bit set (or clear, when inverted), so
//   a few photos tell every LED apart.
export const mappingPatternValidator = v.union(
  v.object({ kind: v.literal("off") }),
  v.object({ kind: v.literal("all") }),
  v.object({ kind: v.literal("string"), nodeKey: v.string() }),
  v.object({
    kind: v.literal("led"),
    nodeKey: v.string(),
    index: v.number(),
  }),
  v.object({
    kind: v.literal("ranges"),
    ranges: v.array(
      v.object({ nodeKey: v.string(), from: v.number(), to: v.number() }),
    ),
  }),
  v.object({
    kind: v.literal("bit"),
    bit: v.number(),
    inverted: v.boolean(),
  }),
);

export type MappingPattern = Infer<typeof mappingPatternValidator>;

// A string's LED positions, as a session proposes or replaces them. null:
// the string had none.
export const stringPositionsValidator = v.object({
  nodeKey: v.string(),
  ledPositions: v.union(v.array(pointValidator), v.null()),
});

// One LED as a camera photo shows it: u, v in 0..1 image space (u across from
// the left edge, v down from the top, pixel centres at (x + 0.5) / width), and
// how sure the decoder is, 0..1. Below 0.25 the LED wasn't seen: its point was
// interpolated from its neighbours along the string.
export const mappingImagePointValidator = v.object({
  u: v.number(),
  v: v.number(),
  confidence: v.number(),
});

// What one camera viewpoint saw (tools/mapping, `upload`). The editor lines its
// 3D camera up with `photo`, then raycasts each point onto the house.
export const mappingViewValidator = v.object({
  // The viewpoint's name, e.g. "front", "side-left". Uploading the same name
  // again replaces it.
  name: v.string(),
  uploadedAt: v.number(),
  // Every LED lit, with what ambient light there was: for lining up the camera.
  photo: v.id("_storage"),
  // Every LED dark, same exposure as the capture (when the run had one).
  darkPhoto: v.optional(v.id("_storage")),
  imageWidth: v.number(),
  imageHeight: v.number(),
  // Per string, indexed by LED: null where the camera didn't see it.
  strings: v.array(
    v.object({
      nodeKey: v.string(),
      points: v.array(v.union(mappingImagePointValidator, v.null())),
    }),
  ),
});

export type MappingView = Infer<typeof mappingViewValidator>;

export const mappingSessionState = v.union(
  v.object({
    kind: v.literal("capturing"),
    // The pattern the camera wants next. seq goes up by one with each.
    request: v.object({ seq: v.number(), pattern: mappingPatternValidator }),
    // The last seq HWIR has sent out over UDP (null: none yet).
    shownSeq: v.union(v.number(), v.null()),
    // Abandoned (the editor closed, the camera gave up) if nothing happens
    // by then. Each pattern and ack moves it on.
    expiresAt: v.number(),
  }),
  v.object({ kind: v.literal("solving") }),
  v.object({
    kind: v.literal("review"),
    proposed: v.array(stringPositionsValidator),
  }),
  v.object({
    kind: v.literal("applied"),
    appliedAt: v.number(),
    // What the strings had before, for ROLLBACK.
    previous: v.array(stringPositionsValidator),
  }),
  v.object({ kind: v.literal("discarded"), reason: v.string() }),
);

export default defineSchema({
  // One row per project: the display's on/off, mode and brightness.
  displayControls: defineTable({
    projectId: v.id("projects"),
    state: displayControlState,
    stateTimers: machineTimers,
  }).index("by_project", ["projectId"]),

  // One row per switch node: whether its plug is on. Kept apart from the
  // node, which is the editor's to write.
  switchStates: defineTable({
    projectId: v.id("projects"),
    nodeKey: v.string(),
    state: switchStateValidator,
    stateTimers: machineTimers,
  }).index("by_project_node", ["projectId", "nodeKey"]),

  // One row per project: whether HWIR is up, what it runs and how its
  // strings are. The fields beside `state` change with every heartbeat.
  hwirPresences: defineTable({
    projectId: v.id("projects"),
    // The git commit HWIR is running.
    commit: v.string(),
    fps: v.number(),
    strings: v.array(hwirStringStatusValidator),
    // Absent when HWIR has no plug set up, or hasn't switched it yet.
    // eslint-disable-next-line machines/no-optional-on-machine-tables -- heartbeat data like commit and fps, the same in every presence state
    plug: v.optional(hwirPlugStatusValidator),
    // The mapping pattern kinds this HWIR renders; absent from an HWIR older
    // than block fills, which renders only the first ones.
    // eslint-disable-next-line machines/no-optional-on-machine-tables -- heartbeat data like commit and fps, the same in every presence state
    patterns: v.optional(v.array(v.string())),
    state: hwirPresenceState,
    stateTimers: machineTimers,
  }).index("by_project", ["projectId"]),

  // Camera mapping of LED positions, one row per session.
  mappingSessions: defineTable({
    projectId: v.id("projects"),
    startedAt: v.number(),
    state: mappingSessionState,
    stateTimers: machineTimers,
    // The 2D points from each camera viewpoint, for the editor to solve into
    // 3D. Kept through RECAPTURE until a new upload replaces a view.
    // eslint-disable-next-line machines/no-optional-on-machine-tables -- capture data the tool adds beside the state, like hwirPresences' heartbeat fields
    views: v.optional(v.array(mappingViewValidator)),
  })
    .index("by_project_state", ["projectId", "state.kind"])
    .index("by_state_started", ["state.kind", "startedAt"]),

  // Every photo a mapping session's view holds, so the daily clean-up
  // (mapping.cleanUpPhotos) can tell a held photo from a stray upload by
  // index, however many sessions there are. addView keeps it in step.
  mappingPhotos: defineTable({
    storageId: v.id("_storage"),
    sessionId: v.id("mappingSessions"),
  })
    .index("by_storage", ["storageId"])
    .index("by_session", ["sessionId"]),

  projects: defineTable(projectFields),

  nodes: defineTable(
    v.union(
      v.object({ ...owned, ...stringNodeFields }),
      v.object({ ...owned, ...folderNodeFields }),
      v.object({ ...owned, ...switchNodeFields }),
      v.object({ ...owned, ...virtualStringNodeFields }),
    ),
  )
    // eslint-disable-next-line @convex-dev/no-duplicate-indexes -- by_project lists a project's rows in the order they were made, which the editor and the phone show; by_project_key finds one row by key.
    .index("by_project", ["projectId"])
    .index("by_project_key", ["projectId", "key"]),

  sequences: defineTable({ ...owned, ...sequenceFields })
    // eslint-disable-next-line @convex-dev/no-duplicate-indexes -- by_project keeps the order rows were made in, which the editor and the phone show; by_project_key finds one row by key.
    .index("by_project", ["projectId"])
    .index("by_project_key", ["projectId", "key"]),

  playlists: defineTable({ ...owned, ...playlistFields })
    // eslint-disable-next-line @convex-dev/no-duplicate-indexes -- by_project keeps the order rows were made in, which the editor and the phone show; by_project_key finds one row by key.
    .index("by_project", ["projectId"])
    .index("by_project_key", ["projectId", "key"]),
});
