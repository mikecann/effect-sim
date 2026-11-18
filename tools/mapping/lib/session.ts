import { readFileSync } from "node:fs";
import { ConvexClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MappingPattern, MappingView } from "../../../convex/schema";
import type { MappedString } from "./manifest";

// The capture tool's side of a mapping session (convex/mapping.ts). It asks
// for a pattern (SHOW), then waits for HWIR's ack (shownSeq) before the camera
// takes its photo.

export interface MappingSessionDriver {
  readonly sessionId: string;
  /** Lights a pattern and resolves once HWIR has sent it to the strings. */
  show(pattern: MappingPattern, timeoutMs?: number): Promise<{ seq: number }>;
}

type SessionState = NonNullable<Awaited<ReturnType<ConvexClient["query"]>>>;

/** Thrown when HWIR doesn't ack in time, or the session left capturing. */
export class AckError extends Error {}

export class ConvexMapping {
  readonly client: ConvexClient;

  constructor(
    url: string,
    private readonly token: string | undefined,
  ) {
    this.client = new ConvexClient(url);
  }

  private withToken<T extends object>(args: T) {
    return this.token ? { ...args, token: this.token } : args;
  }

  async strings(projectId: string): Promise<MappedString[]> {
    const data = await this.client.query(api.functions.getDataForProject, {
      projectId: projectId as Id<"projects">,
    });
    return data.nodes
      .filter((n) => n.kind === "string")
      .map((n) => ({
        key: n.key,
        name: (n as { name: string }).name,
        ledCount: (n as { ledCount: number }).ledCount,
      }));
  }

  active(projectId: string) {
    return this.client.query(api.mapping.active, {
      projectId: projectId as Id<"projects">,
    });
  }

  get(sessionId: string) {
    return this.client.query(api.mapping.get, {
      sessionId: sessionId as Id<"mappingSessions">,
    });
  }

  presence(projectId: string) {
    return this.client.query(api.hwir.presence, {
      projectId: projectId as Id<"projects">,
    });
  }

  /**
   * The project's capturing session, starting one if none is running. A
   * session in solving or review is only taken back to capturing with
   * `recapture`, so a finished one isn't disturbed by accident.
   */
  async startOrJoin(projectId: string, opts: { recapture?: boolean } = {}) {
    const active = await this.active(projectId);
    if (active?.state.kind === "capturing")
      return { sessionId: active.id, joined: true };
    if (active) {
      if (!opts.recapture)
        throw new Error(
          `Session ${active.id} is in ${active.state.kind}. Pass --recapture to capture into it again, or discard it.`,
        );
      await this.mutate(api.mapping.recapture, { sessionId: active.id });
      return { sessionId: active.id, joined: true };
    }
    const created = await this.mutate(api.mapping.start, {
      projectId: projectId as Id<"projects">,
    });
    if (created.status !== "done")
      throw new Error(`Couldn't start a session: ${JSON.stringify(created)}`);
    return { sessionId: created.id as string, joined: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- every mapping mutation takes an optional token on top of its own args
  async mutate(fn: any, args: Record<string, unknown>): Promise<any> {
    const result = await this.client.mutation(fn, this.withToken(args));
    if (
      result &&
      typeof result === "object" &&
      "status" in result &&
      result.status !== "done"
    )
      throw new Error(`Refused: ${JSON.stringify(result)}`);
    return result;
  }

  driver(sessionId: string): ConvexSessionDriver {
    return new ConvexSessionDriver(this, sessionId);
  }

  async uploadFile(path: string, contentType: string): Promise<string> {
    const url = (await this.mutate(
      api.mapping.generateUploadUrl,
      {},
    )) as string;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: readFileSync(path),
    });
    if (!res.ok)
      throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
    return ((await res.json()) as { storageId: string }).storageId;
  }

  addView(sessionId: string, view: MappingView) {
    return this.mutate(api.mapping.addView, {
      sessionId: sessionId as Id<"mappingSessions">,
      view,
    });
  }

  deleteUnattached(storageIds: string[]) {
    return this.mutate(api.mapping.deleteUnattached, {
      storageIds: storageIds as Id<"_storage">[],
    });
  }

  close() {
    return this.client.close();
  }
}

export class ConvexSessionDriver implements MappingSessionDriver {
  private latest: SessionState | null = null;
  private listeners = new Set<() => void>();
  private unsubscribe: () => void;

  constructor(
    private readonly mapping: ConvexMapping,
    readonly sessionId: string,
  ) {
    this.unsubscribe = mapping.client.onUpdate(
      api.mapping.get,
      { sessionId: sessionId as Id<"mappingSessions"> },
      (row) => {
        this.latest = row;
        for (const l of this.listeners) l();
      },
    );
  }

  private state() {
    return (
      this.latest as {
        state: {
          kind: string;
          request?: { seq: number };
          shownSeq?: number | null;
        };
      } | null
    )?.state;
  }

  async show(pattern: MappingPattern, timeoutMs = 15_000) {
    await this.mapping.mutate(api.mapping.show, {
      sessionId: this.sessionId as Id<"mappingSessions">,
      pattern,
    });
    // The mutation resolves once the subscription has seen its write, but read
    // the seq fresh in case the subscription hasn't delivered yet.
    const row = await this.mapping.get(this.sessionId);
    if (row?.state.kind !== "capturing")
      throw new AckError(
        `The session is ${row?.state.kind ?? "gone"}, not capturing.`,
      );
    const seq = row.state.request.seq;
    await new Promise<void>((resolve, reject) => {
      const check = () => {
        const state = this.state();
        if (state && state.kind !== "capturing") {
          done();
          reject(
            new AckError(`The session moved to ${state.kind} while waiting.`),
          );
        } else if (state?.request && state.request.seq > seq) {
          done();
          reject(new AckError("Someone else asked for a newer pattern."));
        } else if ((state?.shownSeq ?? -1) >= seq) {
          done();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        done();
        reject(
          new AckError(
            `HWIR didn't confirm pattern ${seq} within ${timeoutMs / 1000}s. Is it running and in mapping mode? (bun tools/mapping/cli.ts status)`,
          ),
        );
      }, timeoutMs);
      const done = () => {
        clearTimeout(timer);
        this.listeners.delete(check);
      };
      this.listeners.add(check);
      check();
    });
    return { seq };
  }

  close() {
    this.unsubscribe();
  }
}
