import dgram from "node:dgram";
import { reachOut } from "../../shared/outsideWorld";
import { logger } from "../utils/logger";
import {
  canSend,
  initialConnection,
  probeDelay,
  stepConnection,
  type Connection,
  type ConnectionEvent,
} from "./connection";
import { DdpPacketizer } from "./ddp";

const PROBE_TIMEOUT_MS = 2_000;

/**
 * What happened to one frame for one string:
 * - sent: every packet went out over UDP;
 * - failed: the socket refused it (the string is now degraded);
 * - busy: the last frame was still going out, so this one was dropped;
 * - unreachable: the string isn't live, so nothing was sent.
 */
export type SendOutcome = "sent" | "failed" | "busy" | "unreachable";

type WledInfo = { uptime?: number };

/**
 * One WLED string: sends it DDP frames and keeps its connection state
 * (./connection.ts) from send errors and a rate-limited /json/info probe.
 * When it comes back, its on-state and brightness are put back. Everything
 * that reaches the network goes through shared/outsideWorld, so in dry runs
 * nothing is sent and every probe fails: the strings report offline.
 */
export class StringLink {
  private connection: Connection;
  private readonly packetizer = new DdpPacketizer();
  private readonly socket: dgram.Socket | null;
  private inFlight = 0;
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private probing = false;
  private closed = false;
  private needsReapply = true;
  private lastUptime: number | null = null;

  constructor(
    private readonly options: {
      host: string;
      port: number;
      /** For log lines; read each time so renames show. */
      name: () => string;
      /** WLED's own brightness for the string (0 to 255). */
      brightness: () => number;
      /** WLED's JSON API; tests point it at a fake. */
      httpBase?: string;
    },
  ) {
    this.connection = initialConnection(Date.now());
    this.socket = reachOut(
      `sending DDP to ${options.host}:${options.port}`,
      () => dgram.createSocket("udp4"),
      null,
    );
    this.socket?.on("error", (e) =>
      this.handle({ kind: "SEND_FAILED", error: String(e) }),
    );
    this.scheduleProbe(0);
  }

  private get httpBase() {
    return this.options.httpBase ?? `http://${this.options.host}`;
  }

  get state(): Connection {
    return this.connection;
  }

  /** Sends one frame. Never throws; the outcome says what happened. */
  send(rgb: Uint8Array): Promise<SendOutcome> {
    if (this.closed || !this.socket || !canSend(this.connection))
      return Promise.resolve("unreachable");
    if (this.inFlight > 0) return Promise.resolve("busy");
    const packets = this.packetizer.pack(rgb);
    const socket = this.socket;
    this.inFlight = packets.length;
    return new Promise((resolve) => {
      let failed: unknown = null;
      const done = (error: unknown) => {
        if (error) failed = error;
        this.inFlight--;
        if (this.inFlight > 0) return;
        if (!failed) return resolve("sent");
        this.handle({ kind: "SEND_FAILED", error: errorText(failed) });
        resolve("failed");
      };
      for (const packet of packets)
        try {
          socket.send(packet, this.options.port, this.options.host, done);
        } catch (e) {
          done(e);
        }
    });
  }

  /** The string's brightness changed in the editor. */
  brightnessChanged() {
    this.needsReapply = true;
    if (canSend(this.connection)) void this.reapply();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.probeTimer) clearTimeout(this.probeTimer);
    this.socket?.close();
    // Hand the board back to its own effects, as before.
    void this.post({ on: false }).catch(() => {});
  }

  private handle(event: ConnectionEvent) {
    if (this.closed) return;
    const before = this.connection.kind;
    const step = stepConnection(this.connection, event, Date.now());
    this.connection = step.state;
    if (step.log) {
      const line = `String '${this.options.name()}' (${this.options.host}): ${step.log}`;
      if (step.state.kind === "live") logger.info(line);
      else logger.warn(line);
    }
    if (step.reapply) this.needsReapply = true;
    if (this.needsReapply && canSend(this.connection)) void this.reapply();
    // A send failure is worth checking straight away.
    if (before !== this.connection.kind && event.kind === "SEND_FAILED")
      this.scheduleProbe(0);
  }

  private scheduleProbe(delay: number) {
    if (this.closed) return;
    if (this.probeTimer) clearTimeout(this.probeTimer);
    this.probeTimer = setTimeout(() => void this.probe(), delay);
  }

  private async probe() {
    if (this.closed || this.probing) return;
    this.probing = true;
    try {
      const info = await this.get("/json/info");
      // An uptime that went backwards means the board restarted, which
      // resets its brightness.
      if (
        typeof info.uptime === "number" &&
        this.lastUptime !== null &&
        info.uptime < this.lastUptime
      )
        this.needsReapply = true;
      if (typeof info.uptime === "number") this.lastUptime = info.uptime;
      this.handle({ kind: "PROBE_OK" });
    } catch (e) {
      this.handle({ kind: "PROBE_FAILED", error: errorText(e) });
    } finally {
      this.probing = false;
      this.scheduleProbe(probeDelay(this.connection));
    }
  }

  private reapplying = false;
  private async reapply() {
    if (this.reapplying) return;
    this.reapplying = true;
    this.needsReapply = false;
    const bri = Math.round(clamp(this.options.brightness(), 0, 255));
    try {
      await this.post({ on: true, bri });
    } catch (e) {
      // Try again after the next good probe.
      this.needsReapply = true;
      logger.warn(
        `String '${this.options.name()}' (${this.options.host}): couldn't set on and brightness ${bri}: ${errorText(e)}`,
      );
    } finally {
      this.reapplying = false;
    }
  }

  private async get(path: string): Promise<WledInfo> {
    const info = await reachOut(
      `calling WLED on ${this.options.host}`,
      async (): Promise<WledInfo | null> => {
        const res = await fetch(`${this.httpBase}${path}`, {
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return ((await res.json()) as WledInfo | null) ?? {};
      },
      Promise.resolve(null),
    );
    if (!info) throw new Error("dry run, no network");
    return info;
  }

  private post(body: Record<string, unknown>): Promise<void> {
    return reachOut(
      `calling WLED on ${this.options.host}`,
      async () => {
        const res = await fetch(`${this.httpBase}/json/state`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      },
      Promise.resolve(),
    );
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

const errorText = (e: unknown) =>
  e instanceof Error
    ? e.name === "TimeoutError"
      ? "timed out"
      : e.message
    : String(e);
