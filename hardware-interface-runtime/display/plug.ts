// The display's mains plug (Home Assistant, homeAssistant.ts): switching it
// with retries, and following it when something else switches it.

/** Waits between tries when switching the plug fails. The last one repeats. */
export const PLUG_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

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

type Wait = (ms: number) => Promise<void>;
const wait: Wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Switches the plug to the latest target, retrying with backoff until it
 * works or a newer target replaces it. `switchTo` resolves once and for all:
 * true if the first try worked, false if it failed and retries carry on in
 * the background, so the caller can confirm the LED side either way.
 */
export class PlugSwitcher {
  status: PlugStatus | null = null;
  private generation = 0;
  private pending = false;

  constructor(
    private readonly switchPlug: (on: boolean) => Promise<void>,
    private readonly onChange: (status: PlugStatus) => void = () => {},
    private readonly sleep: Wait = wait,
  ) {}

  /** A switch is under way or retrying: what Home Assistant says may be stale. */
  get busy() {
    return this.pending;
  }

  async switchTo(on: boolean): Promise<boolean> {
    const generation = ++this.generation;
    this.pending = true;
    const firstWorked = await this.attempt(on, 1);
    if (firstWorked) {
      this.pending = false;
      return true;
    }
    void (async () => {
      for (let tries = 2; ; tries++) {
        const delay =
          PLUG_RETRY_DELAYS_MS[
            Math.min(tries - 2, PLUG_RETRY_DELAYS_MS.length - 1)
          ];
        await this.sleep(delay);
        if (generation !== this.generation) return;
        if (await this.attempt(on, tries)) break;
        if (generation !== this.generation) return;
      }
      if (generation === this.generation) this.pending = false;
    })();
    return false;
  }

  private async attempt(on: boolean, tries: number): Promise<boolean> {
    try {
      await this.switchPlug(on);
      this.set({ kind: "ok", on, at: Date.now() });
      return true;
    } catch (e) {
      const prev = this.status;
      this.set({
        kind: "failing",
        on,
        error: e instanceof Error ? e.message : String(e),
        since:
          prev?.kind === "failing" && prev.on === on ? prev.since : Date.now(),
        tries,
      });
      return false;
    }
  }

  private set(status: PlugStatus) {
    const prev = this.status;
    this.status = status;
    if (prev?.kind !== status.kind || prev.on !== status.on)
      this.onChange(status);
  }
}

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
