import { defineMachine } from "@convex-dev/state-machines";
import { v } from "convex/values";
import schema, {
  displayModeValidator,
  displaySettingsValidator,
} from "./schema";

/** How long HWIR has to confirm a change before the phone says it's offline. */
export const APPLY_TIMEOUT_MS = 15_000;

const settingsPatch = {
  isOn: v.optional(v.boolean()),
  brightness: v.optional(v.number()),
  mode: v.optional(displayModeValidator),
};

// The display's on/off, mode and brightness, and whether HWIR (the runtime on
// Tinker Desk that drives the lights) has caught up with the last change.
// The phone sends REQUEST; HWIR answers APPLIED once it's playing the new
// settings. Every state keeps the settings, so HWIR just plays state.settings.
export const displayControl = defineMachine(
  schema,
  {
    name: "displayControl",
    table: "displayControls",
    description:
      "What the Christmas lights display should be doing (on or off, which mode, how bright), and whether the lights runtime has confirmed it's doing it.",
    // The token check lives in convex/display.ts, before any send, so both
    // roles always pass here.
    callers: {
      remote: "Only the phone remote can change the display.",
      player: "Only the lights runtime can confirm a change.",
    },
    events: {
      remote: { REQUEST: settingsPatch },
      player: {
        BOOT: { settings: displaySettingsValidator },
        APPLIED: { requestedAt: v.number() },
      },
    },
    guards: {
      isLatestRequest: "That confirmation is for an older change.",
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
      remote: () => true,
      player: () => true,
    },
    guards: {
      isLatestRequest: (_ctx, { state, event }) =>
        "requestedAt" in state && state.requestedAt === event.requestedAt,
    },
    effects: {
      boot: async (_ctx, { event }) => ({
        kind: "live",
        settings: event.settings,
        appliedAt: Date.now(),
      }),
      request: async (_ctx, { state, event }) => ({
        kind: "applying",
        settings: {
          isOn: event.isOn ?? state.settings.isOn,
          brightness: clamp01(event.brightness ?? state.settings.brightness),
          mode: event.mode ?? state.settings.mode,
        },
        requestedAt: Date.now(),
        timeoutAt: Date.now() + APPLY_TIMEOUT_MS,
      }),
      applied: async (_ctx, { state }) => ({
        kind: "live",
        settings: state.settings,
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
