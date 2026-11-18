import { describe, expect, it } from "vitest";
import {
  PLUG_RETRY_DELAYS_MS,
  PLUG_RETRY_FOR_MS,
  PlugSwitcher,
  followPlug,
  type FollowerInput,
  type PlugReading,
  type PlugStatus,
} from "./plug";

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

/**
 * A fake Home Assistant plug. Each switch call waits until the test
 * resolves or fails it, so tests control the order calls finish in.
 */
const fakePlug = (initial: boolean) => {
  let clock = 1_000;
  const plug = { on: initial as boolean | null, changedAt: 0 };
  const calls: {
    on: boolean;
    finish: (ok: boolean) => void;
  }[] = [];
  const waits: { ms: number; release: () => void }[] = [];
  const external: boolean[] = [];
  const changes: PlugStatus[] = [];
  const setPlug = (on: boolean | null) => {
    if (plug.on !== on) plug.changedAt = clock;
    plug.on = on;
  };
  const switcher = new PlugSwitcher({
    switchPlug: (on) =>
      new Promise<void>((resolve, reject) =>
        calls.push({
          on,
          finish: (ok) => {
            if (!ok) return reject(new Error("Home Assistant 502"));
            setPlug(on);
            resolve();
          },
        }),
      ),
    readPlug: async (): Promise<PlugReading> => ({
      on: plug.on,
      changedAt: plug.changedAt,
    }),
    onChange: (s) => changes.push(s),
    onExternal: (on) => external.push(on),
    sleep: (ms) => new Promise<void>((release) => waits.push({ ms, release })),
    now: () => clock,
  });
  return {
    switcher,
    plug,
    calls,
    waits,
    external,
    changes,
    setPlug,
    tick: (ms: number) => (clock += ms),
  };
};

describe("PlugSwitcher", () => {
  it("resolves true when the first try works", async () => {
    const f = fakePlug(false);
    const first = f.switcher.switchTo(true);
    f.calls[0].finish(true);
    expect(await first).toBe(true);
    expect(f.plug.on).toBe(true);
    expect(f.switcher.busy).toBe(false);
  });

  it("never runs two calls at once, and a slow old call can't land last", async () => {
    const f = fakePlug(false);
    const on = f.switcher.switchTo(true); // slow
    const off = f.switcher.switchTo(false);
    await flush();
    expect(f.calls.map((c) => c.on)).toEqual([true]); // OFF waits its turn
    expect(await on).toBe(false); // replaced
    f.calls[0].finish(true);
    await flush();
    // Then it reconciles to the latest target.
    expect(f.calls.map((c) => c.on)).toEqual([true, false]);
    f.calls[1].finish(true);
    expect(await off).toBe(true);
    expect(f.plug.on).toBe(false);
    expect(f.external).toEqual([]);
  });

  it("retries with backoff after a failed first try, until it works", async () => {
    const f = fakePlug(false);
    const first = f.switcher.switchTo(true);
    f.calls[0].finish(false);
    expect(await first).toBe(false);
    expect(f.switcher.status).toMatchObject({ kind: "failing", tries: 1 });
    for (let i = 1; i <= 3; i++) {
      await flush();
      f.waits[i - 1].release();
      await flush();
      f.calls[i].finish(i === 3);
    }
    await flush();
    expect(f.waits.map((w) => w.ms)).toEqual(PLUG_RETRY_DELAYS_MS.slice(0, 3));
    expect(f.plug.on).toBe(true);
    expect(f.switcher.busy).toBe(false);
    expect(f.changes.map((c) => c.kind)).toEqual(["failing", "ok"]);
  });

  it("stops retrying and follows Home Assistant when it switches the plug meanwhile", async () => {
    // 9:59pm: the phone asks for ON, but Home Assistant's API keeps failing.
    const f = fakePlug(true);
    f.setPlug(false); // someone turned it off before
    f.tick(1_000);
    const first = f.switcher.switchTo(true);
    f.calls[0].finish(false);
    await first;
    await flush();
    // 10pm: the automation switches it (here: on, then its off lands).
    f.tick(60_000);
    f.setPlug(true);
    f.tick(1);
    f.setPlug(false);
    f.waits[0].release();
    await flush();
    expect(f.calls).toHaveLength(1); // no retry turning it back on
    expect(f.external).toEqual([false]);
    expect(f.switcher.busy).toBe(false);
  });

  it("keeps retrying when the plug just came back online", async () => {
    const f = fakePlug(false);
    f.setPlug(null); // unavailable: that's why switching fails
    f.tick(1_000);
    const first = f.switcher.switchTo(true);
    f.calls[0].finish(false);
    await first;
    await flush();
    f.tick(5_000);
    f.setPlug(false); // reconnected, still off
    f.waits[0].release();
    await flush();
    expect(f.external).toEqual([]);
    expect(f.calls.map((c) => c.on)).toEqual([true, true]);
  });

  it("stops when the plug is already at the target", async () => {
    const f = fakePlug(false);
    const first = f.switcher.switchTo(true);
    f.calls[0].finish(false);
    await first;
    await flush();
    f.setPlug(true);
    f.waits[0].release();
    await flush();
    expect(f.calls).toHaveLength(1);
    expect(f.switcher.busy).toBe(false);
    expect(f.switcher.status).toMatchObject({ kind: "ok", on: true });
  });

  it("cancel stops the retries straight away", async () => {
    const f = fakePlug(false);
    const first = f.switcher.switchTo(true);
    f.calls[0].finish(false);
    await first;
    await flush();
    f.switcher.cancel();
    await flush();
    f.waits[0].release();
    await flush();
    expect(f.calls).toHaveLength(1);
    expect(f.switcher.busy).toBe(false);
  });

  it("a new target interrupts a retry wait and goes first", async () => {
    const f = fakePlug(false);
    const first = f.switcher.switchTo(true);
    f.calls[0].finish(false);
    await first;
    await flush();
    const off = f.switcher.switchTo(false);
    await flush();
    expect(f.calls.map((c) => c.on)).toEqual([true, false]);
    f.calls[1].finish(true);
    expect(await off).toBe(true);
  });

  it("gives up after about two minutes, still reporting the failure", async () => {
    // 9:59pm: the phone asks for ON and Home Assistant keeps failing. The
    // plug was already off, so the 10pm automation changes nothing HWIR can
    // see: only the time limit stops a late ON.
    const f = fakePlug(false);
    const first = f.switcher.switchTo(true);
    f.calls[0].finish(false);
    await first;
    let elapsed = 0;
    for (let i = 0; i < 20 && f.switcher.busy; i++) {
      await flush();
      const wait = f.waits[i];
      if (!wait) break;
      f.tick(wait.ms);
      elapsed += wait.ms;
      wait.release();
      await flush();
      f.calls[i + 1]?.finish(false);
    }
    await flush();
    expect(f.switcher.busy).toBe(false);
    expect(elapsed).toBeLessThanOrEqual(PLUG_RETRY_FOR_MS);
    expect(f.calls.length).toBe(PLUG_RETRY_DELAYS_MS.length + 1);
    expect(f.calls.every((c) => c.on)).toBe(true);
    expect(f.switcher.status).toMatchObject({ kind: "failing", on: true });
    // And the follower, now that the switcher isn't busy, adopts the plug.
    expect(
      followPlug({
        status: "live",
        isOn: true,
        requestedAt: null,
        plugOn: false,
        plugBusy: f.switcher.busy,
        appliedRequestedAt: null,
      }),
    ).toEqual({ kind: "report", isOn: false });
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
