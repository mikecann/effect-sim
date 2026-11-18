import { describe, expect, it } from "vitest";
import {
  PLUG_RETRY_DELAYS_MS,
  PlugSwitcher,
  followPlug,
  type FollowerInput,
  type PlugStatus,
} from "./plug";

/** A sleep the test releases by hand, recording each wait. */
const manualSleep = () => {
  const waits: { ms: number; release: () => void }[] = [];
  const sleep = (ms: number) =>
    new Promise<void>((release) => waits.push({ ms, release }));
  return { sleep, waits };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("PlugSwitcher", () => {
  it("resolves true when the first try works", async () => {
    const calls: boolean[] = [];
    const switcher = new PlugSwitcher(async (on) => {
      calls.push(on);
    });
    expect(await switcher.switchTo(true)).toBe(true);
    expect(calls).toEqual([true]);
    expect(switcher.status).toMatchObject({ kind: "ok", on: true });
    expect(switcher.busy).toBe(false);
  });

  it("resolves false after a failed first try, then retries with backoff until it works", async () => {
    let failuresLeft = 3;
    const changes: PlugStatus[] = [];
    const { sleep, waits } = manualSleep();
    const switcher = new PlugSwitcher(
      async () => {
        if (failuresLeft-- > 0) throw new Error("Home Assistant 502");
      },
      (s) => changes.push(s),
      sleep,
    );
    expect(await switcher.switchTo(false)).toBe(false);
    expect(switcher.busy).toBe(true);
    expect(switcher.status).toMatchObject({
      kind: "failing",
      on: false,
      error: "Home Assistant 502",
      tries: 1,
    });
    for (let i = 0; i < 3; i++) {
      await flush();
      waits[i].release();
    }
    await flush();
    expect(waits.map((w) => w.ms)).toEqual(PLUG_RETRY_DELAYS_MS.slice(0, 3));
    expect(switcher.status).toMatchObject({ kind: "ok", on: false });
    expect(switcher.busy).toBe(false);
    // One report when it started failing and one when it recovered.
    expect(changes.map((c) => c.kind)).toEqual(["failing", "ok"]);
  });

  it("a newer target stops the old retries", async () => {
    const calls: boolean[] = [];
    let fail = true;
    const { sleep, waits } = manualSleep();
    const switcher = new PlugSwitcher(
      async (on) => {
        calls.push(on);
        if (fail) throw new Error("down");
      },
      () => {},
      sleep,
    );
    await switcher.switchTo(true);
    fail = false;
    expect(await switcher.switchTo(false)).toBe(true);
    waits[0].release();
    await flush();
    expect(calls).toEqual([true, false]);
    expect(switcher.status).toMatchObject({ kind: "ok", on: false });
  });
});

describe("followPlug", () => {
  const base: FollowerInput = {
    status: "live",
    isOn: true,
    requestedAt: null,
    plugOn: true,
    plugBusy: false,
    appliedRequestedAt: null,
  };

  it("does nothing while the plug agrees, is unknown, or HWIR just switched it", () => {
    expect(followPlug(base)).toEqual({ kind: "none" });
    expect(followPlug({ ...base, plugOn: null })).toEqual({ kind: "none" });
    expect(followPlug({ ...base, plugOn: false, plugBusy: true })).toEqual({
      kind: "none",
    });
  });

  it("reports Home Assistant's switch when live", () => {
    expect(followPlug({ ...base, plugOn: false })).toEqual({
      kind: "report",
      isOn: false,
    });
  });

  it("re-confirms a change it applied whose confirmation was lost, applying or unreachable", () => {
    for (const status of ["applying", "unreachable"] as const) {
      expect(
        followPlug({
          ...base,
          status,
          requestedAt: 42,
          appliedRequestedAt: 42,
          plugOn: false,
        }),
      ).toEqual({ kind: "confirm", requestedAt: 42 });
      // Not one it hasn't applied yet.
      expect(
        followPlug({
          ...base,
          status,
          requestedAt: 43,
          appliedRequestedAt: 42,
        }),
      ).toEqual({ kind: "none" });
    }
  });
});
