import { defineMachine } from "@convex-dev/state-machines";
import schema from "./schema";
import { isRole } from "./roles";

/** HWIR sends a heartbeat this often. */
export const HEARTBEAT_INTERVAL_MS = 10_000;
/** With no heartbeat for this long, HWIR is probably struggling. */
export const STALE_AFTER_MS = 30_000;
/** With no heartbeat for this long, HWIR is down. */
export const OFFLINE_AFTER_MS = 120_000;

// Whether HWIR, the runtime on Tinker Desk that drives the lights, is up.
// It sends a heartbeat every 10 s (convex/hwir.ts), which also carries the
// commit it runs, its frame rate and each string's connection; those live on
// the row beside the state. Missed heartbeats move it to stale, then offline.
//
// History is off: a heartbeat every 10 s would add 8,640 steps a day.
export const hwirPresence = defineMachine(
  schema,
  {
    name: "hwirPresence",
    table: "hwirPresences",
    history: false,
    description:
      "Whether the lights runtime (HWIR) is running, from the heartbeat it sends every 10 seconds.",
    callers: {
      runtime: "Only the lights runtime sends heartbeats.",
    },
    events: {
      runtime: { HEARTBEAT: {} },
    },
    states: {
      start: {
        on: {
          HEARTBEAT: {
            to: "online",
            effect: "cameOnline",
            description: "The runtime's first heartbeat for this project.",
          },
        },
      },
      online: {
        description: "The runtime is running and sent a heartbeat recently.",
        timers: {
          WENT_QUIET: {
            at: "staleAt",
            description: "30 seconds passed with no heartbeat.",
          },
        },
        on: {
          HEARTBEAT: {
            effect: "stillOnline",
            description: "Another heartbeat; the 30 seconds start again.",
          },
          WENT_QUIET: {
            to: "stale",
            effect: "wentQuiet",
            description: "Heartbeats stopped coming.",
          },
        },
      },
      stale: {
        description:
          "No heartbeat for 30 seconds: the runtime may be stuck, restarting or updating.",
        timers: {
          GONE: {
            at: "offlineAt",
            description: "Two minutes passed with no heartbeat.",
          },
        },
        on: {
          HEARTBEAT: {
            to: "online",
            effect: "cameOnline",
            description: "The runtime is back.",
          },
          GONE: {
            to: "offline",
            effect: "gone",
            description: "The runtime is down.",
          },
        },
      },
      offline: {
        description:
          "No heartbeat for two minutes: the runtime isn't running, or Tinker Desk is off the network.",
        on: {
          HEARTBEAT: {
            to: "online",
            effect: "cameOnline",
            description: "The runtime started again.",
          },
        },
      },
    },
  },
  {
    callers: {
      runtime: (ctx) => isRole(ctx, "hwir"),
    },
    effects: {
      cameOnline: async () => {
        const now = Date.now();
        return {
          kind: "online",
          since: now,
          lastSeenAt: now,
          staleAt: now + STALE_AFTER_MS,
        };
      },
      stillOnline: async (_ctx, { state }) => {
        const now = Date.now();
        return {
          kind: "online",
          since: state.since,
          lastSeenAt: now,
          staleAt: now + STALE_AFTER_MS,
        };
      },
      wentQuiet: async (_ctx, { state }) => ({
        kind: "stale",
        lastSeenAt: state.lastSeenAt,
        offlineAt: state.lastSeenAt + OFFLINE_AFTER_MS,
      }),
      gone: async (_ctx, { state }) => ({
        kind: "offline",
        lastSeenAt: state.lastSeenAt,
      }),
    },
  },
);
