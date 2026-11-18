import { describe, expect, it } from "vitest";
import {
  FAILURES_TO_OFFLINE,
  PROBE_INTERVAL_MS,
  canSend,
  initialConnection,
  probeDelay,
  stepConnection,
  type Connection,
  type ConnectionEvent,
} from "./connection";

const ok: ConnectionEvent = { kind: "PROBE_OK" };
const probeFail: ConnectionEvent = { kind: "PROBE_FAILED", error: "timed out" };
const sendFail: ConnectionEvent = { kind: "SEND_FAILED", error: "EHOSTDOWN" };

/** Runs events from `state`, one second apart, collecting the log lines. */
const run = (state: Connection, events: ConnectionEvent[], start = 1_000) => {
  const logs: string[] = [];
  let reapplies = 0;
  events.forEach((event, i) => {
    const step = stepConnection(state, event, start + i * 1000);
    state = step.state;
    if (step.log) logs.push(step.log);
    if (step.reapply) reapplies++;
  });
  return { state, logs, reapplies };
};

describe("string connection", () => {
  it("connects on the first good probe and re-applies on and brightness", () => {
    const { state, logs, reapplies } = run(initialConnection(0), [ok]);
    expect(state).toEqual({ kind: "live", since: 1000, lastSeenAt: 1000 });
    expect(logs).toEqual(["live"]);
    expect(reapplies).toBe(1);
  });

  it("goes offline from connecting after 3 failed probes, logging once", () => {
    const fails = Array.from({ length: FAILURES_TO_OFFLINE }, () => probeFail);
    const { state, logs } = run(initialConnection(0), fails);
    expect(state.kind).toBe("offline");
    expect(logs).toEqual(["offline: can't reach it (timed out)"]);
    // Before the third it's still connecting, and quiet.
    expect(run(initialConnection(0), fails.slice(1)).state.kind).toBe(
      "connecting",
    );
  });

  it("a send error degrades a live string; a good probe brings it back", () => {
    const live = run(initialConnection(0), [ok]).state;
    const { state, logs, reapplies } = run(live, [sendFail, sendFail, ok]);
    expect(state.kind).toBe("live");
    expect(logs).toEqual([
      "degraded: send failed (EHOSTDOWN)",
      "live again after 2s degraded",
    ]);
    expect(reapplies).toBe(1);
  });

  it("a degraded string goes offline after 3 failed probes, and keeps lastSeenAt", () => {
    const live = run(initialConnection(0), [ok]).state; // seen at 1000
    const { state, logs } = run(
      live,
      [probeFail, probeFail, probeFail, probeFail, probeFail],
      5_000,
    );
    expect(state.kind).toBe("offline");
    expect(state.lastSeenAt).toBe(1000);
    expect(logs).toEqual([
      "degraded: probe failed (timed out)",
      "offline: stopped answering (timed out)",
    ]);
  });

  it("an offline string stays quiet until it answers, then logs how long it was gone", () => {
    const offline = run(initialConnection(0), [
      probeFail,
      probeFail,
      probeFail,
    ]).state; // offline since 3000
    const quiet = run(
      offline,
      [...Array.from({ length: 50 }, () => probeFail), sendFail],
      4_000,
    );
    expect(quiet.logs).toEqual([]);
    const back = stepConnection(quiet.state, ok, 3_000 + 3 * 3_600_000);
    expect(back.state.kind).toBe("live");
    expect(back.log).toBe("back after 3h offline");
    expect(back.reapply).toBe(true);
  });

  it("only sends to live and degraded strings", () => {
    expect(canSend(initialConnection(0))).toBe(false);
    const live = run(initialConnection(0), [ok]).state;
    expect(canSend(live)).toBe(true);
    expect(canSend(stepConnection(live, sendFail, 2).state)).toBe(true);
    const offline = run(initialConnection(0), [
      probeFail,
      probeFail,
      probeFail,
    ]).state;
    expect(canSend(offline)).toBe(false);
  });

  it("probes often while unsure and backs off to a minute while offline", () => {
    expect(probeDelay(initialConnection(0))).toBe(PROBE_INTERVAL_MS.connecting);
    const live = run(initialConnection(0), [ok]).state;
    expect(probeDelay(live)).toBe(PROBE_INTERVAL_MS.live);
    let offline = run(initialConnection(0), [
      probeFail,
      probeFail,
      probeFail,
    ]).state;
    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      delays.push(probeDelay(offline));
      offline = stepConnection(offline, probeFail, 0).state;
    }
    expect(delays).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
  });
});
