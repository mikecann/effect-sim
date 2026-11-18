import { defineMachine } from "@convex-dev/state-machines";
import { v } from "convex/values";
import schema, {
  mappingPatternValidator,
  stringPositionsValidator,
} from "./schema";
import { isRole } from "./roles";
import type { Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";

/** A capture with no new pattern or ack for this long was abandoned. */
export const CAPTURE_IDLE_MS = 10 * 60_000;

const endsCapture = [
  {
    machine: "displayControl" as const,
    event: "MAPPING_ENDED" as const,
    onRefused: "ignore" as const,
  },
];

// Camera mapping: finding where each LED really is. While capturing, the
// editor asks for one pattern at a time (SHOW) and HWIR lights it, then
// acknowledges it (SHOWN) once it's gone out over UDP, so the camera knows
// when to take its photo. The photos are solved into positions, reviewed, and
// applied to the string nodes' ledPositions. `applied` keeps what the strings
// had before, so ROLLBACK puts it back.
//
// Starting a session switches the display to mapping mode (convex/mapping.ts
// sends displayControl MAP); leaving capturing switches it back
// (MAPPING_ENDED, below).
export const mappingSession = defineMachine(
  schema,
  {
    name: "mappingSession",
    table: "mappingSessions",
    description:
      "A camera mapping session: lighting patterns for a camera to photograph, then turning the photos into each LED's position.",
    callers: {
      mapper: "Only the editor runs camera mapping.",
      runtime: "Only the lights runtime confirms a pattern is showing.",
    },
    events: {
      mapper: {
        START: {},
        SHOW: { pattern: mappingPatternValidator },
        CAPTURED: {},
        SOLVED: { proposed: v.array(stringPositionsValidator) },
        RECAPTURE: {},
        APPLY: {},
        ROLLBACK: {},
        DISCARD: {},
      },
      runtime: { SHOWN: { seq: v.number() } },
    },
    guards: {
      isCurrentPattern: "That pattern was replaced by a newer one.",
    },
    states: {
      start: {
        on: {
          START: {
            to: "capturing",
            effect: "startCapture",
            description: "The editor starts mapping, with every LED dark.",
          },
        },
      },
      capturing: {
        description:
          "The lights show the patterns the camera asks for, one at a time.",
        timers: {
          ABANDONED: {
            at: "expiresAt",
            description: "Ten minutes passed with no new pattern or ack.",
          },
        },
        on: {
          SHOW: {
            effect: "show",
            description: "The camera asks for the next pattern.",
          },
          SHOWN: {
            guard: "isCurrentPattern",
            effect: "shown",
            description:
              "The lights runtime has sent the pattern out to the strings, so the camera can take its photo.",
          },
          CAPTURED: {
            to: "solving",
            sends: endsCapture,
            description:
              "The camera has every photo it needs; the lights go back to playing.",
          },
          DISCARD: {
            to: "discarded",
            effect: "discard",
            sends: endsCapture,
            description: "The editor gives up on this session.",
          },
          ABANDONED: {
            to: "discarded",
            effect: "abandon",
            sends: endsCapture,
            description: "Nobody finished the capture.",
          },
        },
      },
      solving: {
        description: "The photos are being turned into LED positions.",
        on: {
          SOLVED: {
            to: "review",
            effect: "propose",
            description: "Positions came out of the photos.",
          },
          RECAPTURE: {
            to: "capturing",
            effect: "startCapture",
            description: "The photos weren't good enough; capture again.",
          },
          DISCARD: {
            to: "discarded",
            effect: "discard",
            description: "The editor gives up on this session.",
          },
        },
      },
      review: {
        description:
          "The proposed positions wait for the editor to check them against the house.",
        on: {
          APPLY: {
            to: "applied",
            effect: "apply",
            description:
              "The positions go onto the strings, and what they had before is kept.",
          },
          RECAPTURE: {
            to: "capturing",
            effect: "startCapture",
            description: "They look wrong; capture again.",
          },
          DISCARD: {
            to: "discarded",
            effect: "discard",
            description: "The editor throws the positions away.",
          },
        },
      },
      applied: {
        description:
          "The strings use the mapped positions. The previous ones are kept for rollback.",
        on: {
          ROLLBACK: {
            to: "discarded",
            effect: "rollback",
            description: "The strings get their previous positions back.",
          },
        },
      },
      discarded: {
        description:
          "Nothing from this session is on the strings: given up, abandoned or rolled back.",
      },
    },
  },
  {
    callers: {
      mapper: (ctx) => isRole(ctx, "editor"),
      runtime: (ctx) => isRole(ctx, "hwir"),
    },
    guards: {
      isCurrentPattern: (_ctx, { state, event }) =>
        state.request.seq === event.seq,
    },
    effects: {
      startCapture: async () => ({
        kind: "capturing",
        request: { seq: 0, pattern: { kind: "off" } },
        shownSeq: null,
        expiresAt: Date.now() + CAPTURE_IDLE_MS,
      }),
      show: async (_ctx, { state, event }) => ({
        kind: "capturing",
        request: { seq: state.request.seq + 1, pattern: event.pattern },
        shownSeq: state.shownSeq,
        expiresAt: Date.now() + CAPTURE_IDLE_MS,
      }),
      shown: async (_ctx, { state, event }) => ({
        kind: "capturing",
        request: state.request,
        shownSeq: event.seq,
        expiresAt: Date.now() + CAPTURE_IDLE_MS,
      }),
      propose: async (_ctx, { event }) => ({
        kind: "review",
        proposed: event.proposed,
      }),
      apply: async (ctx, { row, state }) => {
        const previous = await writePositions(
          ctx.db,
          row.projectId,
          state.proposed,
        );
        return { kind: "applied", appliedAt: Date.now(), previous };
      },
      rollback: async (ctx, { row, state }) => {
        await writePositions(ctx.db, row.projectId, state.previous);
        return { kind: "discarded", reason: "Rolled back." };
      },
      discard: async () => ({ kind: "discarded", reason: "Discarded." }),
      abandon: async () => ({
        kind: "discarded",
        reason: "Abandoned: nothing happened for ten minutes.",
      }),
    },
    links: {
      "displayControl.MAPPING_ENDED": async ({ db, row }) =>
        (await findDisplayControl(db, row.projectId)) ?? [],
    },
  },
);

const findDisplayControl = async (
  db: DatabaseReader,
  projectId: Id<"projects">,
) =>
  (
    await db
      .query("displayControls")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique()
  )?._id;

type StringPositions = (typeof stringPositionsValidator)["type"];

/**
 * Puts positions onto the project's string nodes, and returns what they had
 * before. A string that's gone or whose LED count no longer matches is left
 * out: its positions would be wrong.
 */
const writePositions = async (
  db: {
    query: DatabaseReader["query"];
    patch: (
      table: "nodes",
      id: Id<"nodes">,
      value: { ledPositions: StringPositions["ledPositions"] | undefined },
    ) => Promise<void>;
  },
  projectId: Id<"projects">,
  positions: readonly StringPositions[],
): Promise<StringPositions[]> => {
  const previous: StringPositions[] = [];
  for (const { nodeKey, ledPositions } of positions) {
    const node = await db
      .query("nodes")
      .withIndex("by_project_key", (q) =>
        q.eq("projectId", projectId).eq("key", nodeKey),
      )
      .unique();
    if (node?.kind !== "string") continue;
    if (ledPositions && ledPositions.length !== node.ledCount) continue;
    previous.push({ nodeKey, ledPositions: node.ledPositions ?? null });
    await db.patch("nodes", node._id, {
      ledPositions: ledPositions ?? undefined,
    });
  }
  return previous;
};
