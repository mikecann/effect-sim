// One string's connection, as an explicit state with every move in one place
// (docs/rebuild-plan.md, "State machines"). StringLink drives it from DDP send
// errors and a rate-limited probe of WLED's /json/info; the heartbeat reports
// it (convex/hwir.ts).
//
//   connecting --probe ok--> live --send or probe fails--> degraded
//   degraded --probe ok--> live        degraded --3 probes fail--> offline
//   connecting --3 probes fail--> offline --probe ok--> live

export type Connection =
  | {
      kind: "connecting";
      since: number;
      failures: number;
      lastSeenAt: number | null;
    }
  | { kind: "live"; since: number; lastSeenAt: number }
  | {
      kind: "degraded";
      since: number;
      lastSeenAt: number;
      failures: number;
      error: string;
    }
  | {
      kind: "offline";
      since: number;
      lastSeenAt: number | null;
      failures: number;
      error: string;
    };

export type ConnectionKind = Connection["kind"];

export type ConnectionEvent =
  | { kind: "PROBE_OK" }
  | { kind: "PROBE_FAILED"; error: string }
  | { kind: "SEND_FAILED"; error: string };

export type ConnectionStep = {
  state: Connection;
  /** One log line for a change of state, or null: never one per frame. */
  log: string | null;
  /** The board is reachable again: put its on-state and brightness back. */
  reapply: boolean;
};

/** Failed probes in a row before a connecting or degraded string is offline. */
export const FAILURES_TO_OFFLINE = 3;

export const PROBE_INTERVAL_MS = {
  connecting: 2_000,
  live: 10_000,
  degraded: 2_000,
  offlineFirst: 5_000,
  offlineMax: 60_000,
};

export const initialConnection = (now: number): Connection => ({
  kind: "connecting",
  since: now,
  failures: 0,
  lastSeenAt: null,
});

const ago = (from: number, now: number) => {
  const s = Math.round((now - from) / 1000);
  if (s < 120) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 120) return `${m}m`;
  return `${Math.round(m / 60)}h`;
};

const live = (now: number): Connection => ({
  kind: "live",
  since: now,
  lastSeenAt: now,
});

const stay = (state: Connection): ConnectionStep => ({
  state,
  log: null,
  reapply: false,
});

export const stepConnection = (
  state: Connection,
  event: ConnectionEvent,
  now: number,
): ConnectionStep => {
  if (state.kind === "connecting") {
    if (event.kind === "PROBE_OK")
      return { state: live(now), log: "live", reapply: true };
    if (event.kind === "PROBE_FAILED") {
      const failures = state.failures + 1;
      if (failures < FAILURES_TO_OFFLINE) return stay({ ...state, failures });
      return {
        state: {
          kind: "offline",
          since: now,
          lastSeenAt: state.lastSeenAt,
          failures,
          error: event.error,
        },
        log: `offline: can't reach it (${event.error})`,
        reapply: false,
      };
    }
    // Nothing is sent while connecting.
    return stay(state);
  }

  if (state.kind === "live") {
    if (event.kind === "PROBE_OK") return stay({ ...state, lastSeenAt: now });
    return {
      state: {
        kind: "degraded",
        since: now,
        lastSeenAt: state.lastSeenAt,
        failures: event.kind === "PROBE_FAILED" ? 1 : 0,
        error: event.error,
      },
      log: `degraded: ${event.kind === "PROBE_FAILED" ? "probe" : "send"} failed (${event.error})`,
      reapply: false,
    };
  }

  if (state.kind === "degraded") {
    if (event.kind === "PROBE_OK")
      return {
        state: live(now),
        log: `live again after ${ago(state.since, now)} degraded`,
        reapply: true,
      };
    if (event.kind === "SEND_FAILED") return stay(state);
    if (state.failures + 1 < FAILURES_TO_OFFLINE)
      return stay({ ...state, failures: state.failures + 1 });
    return {
      state: {
        kind: "offline",
        since: now,
        lastSeenAt: state.lastSeenAt,
        failures: state.failures + 1,
        error: event.error,
      },
      log: `offline: stopped answering (${event.error})`,
      reapply: false,
    };
  }

  if (event.kind === "PROBE_OK")
    return {
      state: live(now),
      log: `back after ${ago(state.since, now)} offline`,
      reapply: true,
    };
  if (event.kind === "PROBE_FAILED")
    return stay({ ...state, failures: state.failures + 1 });
  return stay(state);
};

/** How long until the next probe: often while unsure, backing off to a minute while offline. */
export const probeDelay = (state: Connection): number => {
  if (state.kind !== "offline") return PROBE_INTERVAL_MS[state.kind];
  const extra = Math.max(0, state.failures - FAILURES_TO_OFFLINE);
  return Math.min(
    PROBE_INTERVAL_MS.offlineFirst * 2 ** extra,
    PROBE_INTERVAL_MS.offlineMax,
  );
};

/** Frames go out only to strings that answered recently. */
export const canSend = (state: Connection) =>
  state.kind === "live" || state.kind === "degraded";
