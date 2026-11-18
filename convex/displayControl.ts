import { defineMachine } from "@convex-dev/state-machines";
import { v } from "convex/values";
import schema, {
  displaySettingsValidator,
  playbackModeValidator,
  type DisplaySettings,
} from "./schema";
import { isRole } from "./roles";

/** How long HWIR has to confirm a change before the phone says it's offline. */
export const APPLY_TIMEOUT_MS = 15_000;

const settingsPatch = {
  isOn: v.optional(v.boolean()),
  brightness: v.optional(v.number()),
  mode: v.optional(playbackModeValidator),
};

// The display's on/off, mode and brightness, and whether HWIR (the runtime on
// Tinker Desk that drives the lights) has caught up with the last change.
// The phone sends REQUEST; HWIR answers APPLIED once it's playing the new
// settings. Every state keeps the settings, so HWIR just plays state.settings.
// The editor's camera mapping switches the mode to `mapping` (MAP), and the
// session switches it back when it's done with the lights (MAPPING_ENDED).
// HWIR confirms both like any change.
export const displayControl = defineMachine(
  schema,
  {
    name: "displayControl",
    table: "displayControls",
    description:
      "What the Christmas lights display should be doing (on or off, which mode, how bright), and whether the lights runtime has confirmed it's doing it.",
    // Each role is a token (convex/roles.ts).
    callers: {
      remote: "Only the phone remote can change the display.",
      player: "Only the lights runtime can confirm a change.",
      mapper: "Only the editor can start or end camera mapping.",
    },
    events: {
      remote: { REQUEST: settingsPatch },
      mapper: { MAP: { sessionId: v.id("mappingSessions") } },
      mappingSession: { MAPPING_ENDED: {} },
      player: {
        BOOT: { settings: displaySettingsValidator },
        APPLIED: { requestedAt: v.number() },
        PLUG_SWITCHED: { isOn: v.boolean() },
      },
    },
    guards: {
      isLatestRequest: "That confirmation is for an older change.",
      isShowingSession: "The display isn't showing that mapping session.",
    },
    states: {
      start: {
        on: {
          BOOT: {
            to: "live",
            effect: "boot",
            description:
              "The lights runtime starts for a project with no controls yet, and records what it's playing from its startup flags.",
          },
        },
      },
      applying: {
        description:
          "The phone asked for new settings and the lights runtime hasn't confirmed them yet. The phone shows a spinner.",
        timers: {
          TIMED_OUT: {
            at: "timeoutAt",
            description:
              "15 seconds passed since the latest change with no confirmation, so the runtime is probably offline.",
          },
        },
        on: {
          REQUEST: {
            effect: "request",
            description:
              "Another change arrives before the last was confirmed; it replaces it and the 15 seconds start again.",
          },
          MAP: {
            effect: "map",
            description:
              "Camera mapping starts before the last change was confirmed; the lights show its patterns instead.",
          },
          MAPPING_ENDED: {
            guard: "isShowingSession",
            effect: "unmap",
            description:
              "The mapping session ends before the lights confirmed it began; they go back to what they played.",
          },
          APPLIED: {
            to: "live",
            guard: "isLatestRequest",
            effect: "applied",
            description:
              "The lights runtime is now playing the requested settings.",
          },
          TIMED_OUT: {
            to: "unreachable",
            effect: "timedOut",
            description: "Nobody confirmed the change in time.",
          },
        },
      },
      live: {
        description: "The lights are doing what was last asked for.",
        on: {
          REQUEST: {
            to: "applying",
            effect: "request",
            description: "The phone changes the settings.",
          },
          MAP: {
            to: "applying",
            effect: "map",
            description:
              "The editor starts camera mapping: the lights stop playing and show the session's patterns.",
          },
          MAPPING_ENDED: {
            to: "applying",
            guard: "isShowingSession",
            effect: "unmap",
            description:
              "The mapping session the lights show is done with them: they go back to the playlist or sequence they played before.",
          },
          PLUG_SWITCHED: {
            effect: "plugSwitched",
            description:
              "Something other than the phone (Home Assistant's sunset and 10pm automations, or someone at the wall) switched the lights' power plug, so on/off follows it.",
          },
        },
      },
      unreachable: {
        description:
          "The last change was never confirmed, so the lights runtime is probably offline. It still applies the settings when it comes back.",
        on: {
          REQUEST: {
            to: "applying",
            effect: "request",
            description: "The phone tries again.",
          },
          MAP: {
            to: "applying",
            effect: "map",
            description: "The editor starts camera mapping.",
          },
          MAPPING_ENDED: {
            to: "applying",
            guard: "isShowingSession",
            effect: "unmap",
            description: "The mapping session ends.",
          },
          APPLIED: {
            to: "live",
            guard: "isLatestRequest",
            effect: "applied",
            description: "The runtime came back and applied the settings.",
          },
        },
      },
    },
  },
  {
    callers: {
      remote: (ctx) => isRole(ctx, "remote"),
      player: (ctx) => isRole(ctx, "hwir"),
      mapper: (ctx) => isRole(ctx, "editor"),
    },
    guards: {
      isLatestRequest: (_ctx, { state, event }) =>
        "requestedAt" in state && state.requestedAt === event.requestedAt,
      isShowingSession: (_ctx, { state, from }) =>
        state.settings.mode.kind === "mapping" &&
        state.settings.mode.id === from.id,
    },
    effects: {
      boot: async (_ctx, { event }) => ({
        kind: "live",
        settings: event.settings,
        appliedAt: Date.now(),
      }),
      request: async (_ctx, { state, event }) =>
        applying({
          isOn: event.isOn ?? state.settings.isOn,
          brightness: clamp01(event.brightness ?? state.settings.brightness),
          mode: event.mode ?? state.settings.mode,
        }),
      map: async (_ctx, { state, event }) =>
        applying({
          ...state.settings,
          mode: {
            kind: "mapping",
            id: event.sessionId,
            returnTo: playbackOf(state.settings),
          },
        }),
      unmap: async (_ctx, { state }) =>
        applying({ ...state.settings, mode: playbackOf(state.settings) }),
      applied: async (_ctx, { state }) => ({
        kind: "live",
        settings: state.settings,
        appliedAt: Date.now(),
      }),
      plugSwitched: async (_ctx, { state, event }) => ({
        kind: "live",
        settings: { ...state.settings, isOn: event.isOn },
        appliedAt: Date.now(),
      }),
      timedOut: async (_ctx, { state }) => ({
        kind: "unreachable",
        settings: state.settings,
        requestedAt: state.requestedAt,
      }),
    },
  },
);

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const applying = (settings: DisplaySettings) => ({
  kind: "applying" as const,
  settings,
  requestedAt: Date.now(),
  timeoutAt: Date.now() + APPLY_TIMEOUT_MS,
});

/** The playlist or sequence the display plays, or goes back to after mapping. */
export const playbackOf = ({ mode }: DisplaySettings) =>
  mode.kind === "mapping" ? mode.returnTo : mode;
