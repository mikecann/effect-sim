import { defineMachine } from "@convex-dev/state-machines";
import { v } from "convex/values";
import schema from "./schema";
import { isRole } from "./roles";

/** How long a plug has to answer before it counts as unreachable. */
export const SWITCH_TIMEOUT_MS = 10_000;

// A switch node's smart plug (an Athom plug HWIR or the editor switches over
// HTTP). Whoever switches it reports the attempt (SWITCH) and the answer
// (TURNED or FAILED); a plug that never answers times out. The node itself
// stays the editor's: this row is the plug's live state, kept apart so the
// editor's sync never fights the runtime over it.
//
// History is off: a sequence can switch a plug every few seconds all night.
export const switchState = defineMachine(
  schema,
  {
    name: "switchState",
    table: "switchStates",
    history: false,
    description:
      "Whether a switch node's smart plug is on, as last heard from the plug.",
    callers: {
      controller:
        "Only the lights runtime or the editor can switch a plug or report it.",
      editor: "Only the editor adds and removes switches.",
    },
    events: {
      controller: {
        SWITCH: { on: v.boolean() },
        TURNED: { on: v.boolean() },
        FAILED: { error: v.string() },
      },
      editor: { ADD: {}, REMOVE: {} },
    },
    guards: {
      turnedOn: "The plug said it's off.",
    },
    states: {
      start: {
        on: {
          ADD: {
            to: "unknown",
            description: "A switch is added to the project.",
          },
        },
      },
      unknown: {
        description: "Nobody has switched or asked the plug yet.",
        on: {
          SWITCH: {
            to: "switching",
            effect: "switching",
            description: "Something starts switching the plug.",
          },
          TURNED: [
            {
              to: "on",
              guard: "turnedOn",
              effect: "on",
              description: "The plug says it's on.",
            },
            {
              to: "off",
              effect: "off",
              description: "The plug says it's off.",
            },
          ],
          FAILED: {
            to: "unreachable",
            effect: "failed",
            description: "The plug didn't answer.",
          },
          REMOVE: {
            to: "removed",
            description: "The switch is deleted from the project.",
          },
        },
      },
      switching: {
        description:
          "A request to switch the plug is out, and it hasn't answered yet.",
        timers: {
          TIMED_OUT: {
            at: "timeoutAt",
            description: "10 seconds passed with no answer from the plug.",
          },
        },
        on: {
          SWITCH: {
            effect: "switching",
            description:
              "Another switch arrives before the plug answered; the wait starts again.",
          },
          TURNED: [
            {
              to: "on",
              guard: "turnedOn",
              effect: "on",
              description: "The plug switched on.",
            },
            { to: "off", effect: "off", description: "The plug switched off." },
          ],
          FAILED: {
            to: "unreachable",
            effect: "failed",
            description: "The plug refused or couldn't be reached.",
          },
          TIMED_OUT: {
            to: "unreachable",
            effect: "timedOut",
            description: "The plug never answered.",
          },
          REMOVE: {
            to: "removed",
            description: "The switch is deleted from the project.",
          },
        },
      },
      on: {
        description: "The plug is on.",
        on: {
          SWITCH: {
            to: "switching",
            effect: "switching",
            description: "Something switches the plug.",
          },
          TURNED: [
            {
              guard: "turnedOn",
              effect: "on",
              description: "The plug confirms it's still on.",
            },
            {
              to: "off",
              effect: "off",
              description: "The plug was switched off outside the app.",
            },
          ],
          FAILED: {
            to: "unreachable",
            effect: "failed",
            description: "The plug stopped answering.",
          },
          REMOVE: {
            to: "removed",
            description: "The switch is deleted from the project.",
          },
        },
      },
      off: {
        description: "The plug is off.",
        on: {
          SWITCH: {
            to: "switching",
            effect: "switching",
            description: "Something switches the plug.",
          },
          TURNED: [
            {
              to: "on",
              guard: "turnedOn",
              effect: "on",
              description: "The plug was switched on outside the app.",
            },
            {
              effect: "off",
              description: "The plug confirms it's still off.",
            },
          ],
          FAILED: {
            to: "unreachable",
            effect: "failed",
            description: "The plug stopped answering.",
          },
          REMOVE: {
            to: "removed",
            description: "The switch is deleted from the project.",
          },
        },
      },
      unreachable: {
        description:
          "The plug didn't answer the last time it was switched or asked. It's probably unplugged or off the network.",
        on: {
          SWITCH: {
            to: "switching",
            effect: "switching",
            description: "Something tries the plug again.",
          },
          TURNED: [
            {
              to: "on",
              guard: "turnedOn",
              effect: "on",
              description: "The plug is back, and on.",
            },
            {
              to: "off",
              effect: "off",
              description: "The plug is back, and off.",
            },
          ],
          REMOVE: {
            to: "removed",
            description: "The switch is deleted from the project.",
          },
        },
      },
      removed: {
        description:
          "The switch was deleted from the project. The row is purged soon after.",
      },
    },
  },
  {
    callers: {
      controller: (ctx) => isRole(ctx, "hwir", "editor"),
      editor: (ctx) => isRole(ctx, "editor"),
    },
    guards: {
      turnedOn: (_ctx, { event }) => event.on,
    },
    effects: {
      switching: async (_ctx, { event }) => ({
        kind: "switching",
        target: event.on,
        timeoutAt: Date.now() + SWITCH_TIMEOUT_MS,
      }),
      on: async () => ({ kind: "on", changedAt: Date.now() }),
      off: async () => ({ kind: "off", changedAt: Date.now() }),
      failed: async (_ctx, { event }) => ({
        kind: "unreachable",
        error: event.error,
        changedAt: Date.now(),
      }),
      timedOut: async () => ({
        kind: "unreachable",
        error: "The plug didn't answer within 10 seconds.",
        changedAt: Date.now(),
      }),
    },
  },
);
