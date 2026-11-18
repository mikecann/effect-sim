// The display's mains plug (Home Assistant, homeAssistant.ts): switching it
// with retries, and following it when something else switches it.

/** Waits between tries when switching the plug fails. The last one repeats. */
export const PLUG_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

/** Retrying gives up after this long: a stale request shouldn't land hours later. */
export const PLUG_RETRY_FOR_MS = 15 * 60_000;

/** How the plug is doing, for the heartbeat and logs. */
export type PlugStatus =
  | { kind: "ok"; on: boolean; at: number }
  | {
      kind: "failing";
      on: boolean;
      error: string;
      since: number;
      tries: number;
    };

/** What Home Assistant says about the plug. `on` is null when it doesn't know. */
export type PlugReading = { on: boolean | null; changedAt: number | null };

type Target = {
  on: boolean;
  startedAt: number;
  tries: number;
  /** The last reading taken while retrying, to tell a decision from a reconnect. */
  lastReading: PlugReading | null;
  settle: (firstTryWorked: boolean) => void;
};

/**
 * Switches the plug, one Home Assistant call at a time. A new target replaces
 * the old one, and after each call finishes it carries on toward whatever
 * the latest target is, so a slow old call can never land after a newer one.
 *
 * When a switch fails it retries with backoff. Before each retry it reads the
 * plug, and stops if:
 * - the plug is already at the target (someone else did it);
 * - Home Assistant changed it away from the target after this switch started,
 *   from a known state (an automation or someone at the wall, not the plug
 *   coming back online): `onExternal` reports it, so the display follows the
 *   plug instead of fighting it;
 * - `cancel()` was called (the display's on/off moved elsewhere), or it has
 *   retried for PLUG_RETRY_FOR_MS.
 */
export class PlugSwitcher {
  status: PlugStatus | null = null;
  private target: Target | null = null;
  private running = false;
  private wake: (() => void) | null = null;

  constructor(
    private readonly deps: {
      switchPlug: (on: boolean) => Promise<void>;
      readPlug: () => Promise<PlugReading>;
      onChange?: (status: PlugStatus) => void;
      /** Home Assistant switched the plug while HWIR was retrying. */
      onExternal?: (on: boolean) => void;
      sleep?: (ms: number) => Promise<void>;
      now?: () => number;
    },
  ) {}

  /** A switch is under way or retrying: what Home Assistant says may be stale. */
  get busy() {
    return this.target !== null || this.running;
  }

  /** The state HWIR is still trying to switch the plug to, if any. */
  get pendingTarget(): boolean | null {
    return this.target?.on ?? null;
  }

  /**
   * Resolves after the first try for this target: true if it worked, false if
   * it failed (retries carry on in the background) or a newer target came first.
   */
  switchTo(on: boolean): Promise<boolean> {
    this.target?.settle(false);
    return new Promise((resolve) => {
      let settled = false;
      this.target = {
        on,
        startedAt: this.now(),
        tries: 0,
        lastReading: null,
        settle: (worked) => {
          if (settled) return;
          settled = true;
          resolve(worked);
        },
      };
      this.wake?.();
      void this.run();
    });
  }

  /** Stop retrying: the display's on/off no longer wants this target. */
  cancel() {
    this.target?.settle(false);
    this.target = null;
    this.wake?.();
  }

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.target) {
        const t = this.target;
        t.tries++;
        const worked = await this.attempt(t);
        if (this.target !== t) continue; // replaced while in flight: go to the latest
        t.settle(worked);
        if (worked) {
          this.target = null;
          break;
        }
        if (this.now() - t.startedAt >= PLUG_RETRY_FOR_MS) {
          this.target = null;
          break;
        }
        if (this.settledBy(t, await this.read())) break;
        if (this.target !== t) continue;
        await this.pause(
          PLUG_RETRY_DELAYS_MS[
            Math.min(t.tries - 1, PLUG_RETRY_DELAYS_MS.length - 1)
          ],
        );
        if (this.target !== t) continue;
        const reading = await this.read();
        if (this.target !== t) continue;
        if (this.settledBy(t, reading)) break;
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * After a failed try: whether this reading ends the retries (the plug is
   * already at the target, or Home Assistant decided otherwise).
   */
  private settledBy(t: Target, reading: PlugReading): boolean {
    if (this.target !== t) return false;
    if (reading.on === t.on) {
      this.set({ kind: "ok", on: t.on, at: this.now() });
      this.target = null;
      return true;
    }
    if (reading.on !== null && changedByOthers(t, reading)) {
      this.target = null;
      this.set({ kind: "ok", on: reading.on, at: this.now() });
      this.deps.onExternal?.(reading.on);
      return true;
    }
    t.lastReading = reading;
    return false;
  }

  private async attempt(t: Target): Promise<boolean> {
    try {
      await this.deps.switchPlug(t.on);
      this.set({ kind: "ok", on: t.on, at: this.now() });
      return true;
    } catch (e) {
      const prev = this.status;
      this.set({
        kind: "failing",
        on: t.on,
        error: e instanceof Error ? e.message : String(e),
        since:
          prev?.kind === "failing" && prev.on === t.on
            ? prev.since
            : this.now(),
        tries: t.tries,
      });
      return false;
    }
  }

  private async read(): Promise<PlugReading> {
    try {
      return await this.deps.readPlug();
    } catch {
      return { on: null, changedAt: null };
    }
  }

  /** Sleeps, but wakes early for a new target or cancel. */
  private pause(ms: number) {
    const sleep =
      this.deps.sleep ??
      ((d: number) => new Promise<void>((r) => setTimeout(r, d)));
    return Promise.race([
      sleep(ms),
      new Promise<void>((resolve) => {
        this.wake = resolve;
      }),
    ]).finally(() => {
      this.wake = null;
    });
  }

  private set(status: PlugStatus) {
    const prev = this.status;
    this.status = status;
    if (prev?.kind !== status.kind || prev.on !== status.on)
      this.deps.onChange?.(status);
  }
}

/**
 * Whether Home Assistant decided on the plug while HWIR was retrying: it's
 * now away from the target, it changed after this switch started, and the
 * reading before was a known state too. A plug that was unavailable and comes
 * back reconnected rather than decided, so HWIR keeps trying.
 */
const changedByOthers = (t: Target, reading: PlugReading) =>
  reading.on !== null &&
  reading.on !== t.on &&
  reading.changedAt !== null &&
  reading.changedAt > t.startedAt &&
  t.lastReading !== null &&
  t.lastReading.on !== null;

export type FollowerInput = {
  /** The displayControl machine's state (convex/display.ts get). */
  status: "applying" | "live" | "unreachable";
  isOn: boolean;
  requestedAt: number | null;
  /** What Home Assistant says, or null if it doesn't know. */
  plugOn: boolean | null;
  /** HWIR switched the plug recently or is still retrying. */
  plugBusy: boolean;
  /** The last request HWIR applied and tried to confirm. */
  appliedRequestedAt: number | null;
};

export type FollowerAction =
  | { kind: "none" }
  | { kind: "confirm"; requestedAt: number }
  | { kind: "report"; isOn: boolean };

/**
 * What the 10 s plug check does, in every display state:
 * - applying or unreachable for a request HWIR has already applied: its
 *   confirmation was lost (Convex reconnecting), so send it again. Otherwise
 *   the phone stays on "offline" with the lights doing what it asked.
 * - live: when the plug disagrees with on/off (Home Assistant's sunset and
 *   10pm automations), report it so on/off follows the plug.
 */
export const followPlug = (i: FollowerInput): FollowerAction => {
  if (i.status !== "live") {
    if (i.requestedAt !== null && i.appliedRequestedAt === i.requestedAt)
      return { kind: "confirm", requestedAt: i.requestedAt };
    return { kind: "none" };
  }
  if (i.plugBusy || i.plugOn === null || i.plugOn === i.isOn)
    return { kind: "none" };
  return { kind: "report", isOn: i.plugOn };
};
