import {
  action,
  makeObservable,
  observable,
  reaction,
  runInAction,
  toJS,
} from "mobx";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { ProjectData } from "../../../../convex/functions";
import type { ProjectModel } from "../../../../shared/models/ProjectModel";
import { toEditorDoc, type EditorTable } from "../../../../shared/models/docs";
import { stableStringify } from "../../../../shared/stableStringify";
import { LIMITS } from "../../../../convex/editorSync";

export type SyncChange = FunctionArgs<
  typeof api.editor.sync
>["changes"][number];
export type SyncResult = FunctionReturnType<typeof api.editor.sync>;

/** What the editor shows about saving (src/common/SaveStatus.tsx). */
export type SaveStatus =
  | { kind: "loading" }
  | { kind: "saved" }
  | { kind: "saving" }
  | { kind: "error"; message: string; retryAt: number | null };

/** A batch stays well under Convex's argument and write limits. */
export const MAX_BATCH_BYTES = 4_000_000;

/** How long after the last edit a batch goes out. */
export const SYNC_DEBOUNCE_MS = 500;
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];

type Row = { table: EditorTable; key: string; json: string; doc: object };

const rowId = (table: EditorTable, key: string) => `${table}:${key}`;

/** A row's doc as editor.sync takes it: without the project and key, which the change carries. */
const fieldsOf = (doc: { key: string; projectId: string }) => {
  const { key: _key, projectId: _projectId, ...fields } = doc;
  return fields;
};

const projectFields = (doc: Doc<"projects">) => ({
  name: doc.name,
  settings: doc.settings,
});

/**
 * Keeps one open project in step with Convex. The editor's MobX models are
 * the truth while you edit: every change shows at once, and this sends what
 * changed, a batch at a time, through editor.sync (convex/editor.ts).
 *
 * - `base` holds each row as the server last confirmed it. A row whose model
 *   differs from its base has unsaved edits.
 * - Edits are batched for SYNC_DEBOUNCE_MS, and only one batch is ever in
 *   flight: edits made meanwhile go in the next one.
 * - Server updates replace rows with no unsaved edits, and leave the rest.
 * - A change the server skipped (its row was deleted) or rejected (it broke a
 *   rule) is undone: the row goes back to the server's version.
 * - A failed batch (offline, a bad token) is retried with backoff, and the
 *   status says so.
 */
export class ProjectSyncModel {
  status: SaveStatus = { kind: "loading" };
  /** The last batch's skipped and rejected changes, for the editor to show. */
  lastProblems: SyncResult["rejected"] = [];

  private base = new Map<string, string>();
  private baseProject: string | null = null;
  private server: ProjectData | null = null;
  private serverProject: Doc<"projects"> | null = null;
  private serverConfirmed = false;
  private inFlight: Map<string, string | null> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  /** Every row this syncer has seen on the server. A row seen there but no
   * longer in `base` was deleted elsewhere, so it's never sent as a create. */
  private seen = new Set<string>();
  /** Closed for this project: only the last edits still go out. */
  private closed = false;
  /** A closed project's last edits, still to send. */
  private outbox: SyncChange[] = [];
  private disposeReaction: (() => void) | null = null;

  constructor(
    private readonly project: ProjectModel,
    private readonly send: (changes: SyncChange[]) => Promise<SyncResult>,
  ) {
    makeObservable<ProjectSyncModel, "setStatus">(this, {
      status: observable,
      lastProblems: observable,
      setStatus: action,
      applyServerData: action,
    });
  }

  /**
   * Starts watching the models for edits. The project's rows are dropped
   * first and come back from the server: rows kept from an earlier visit have
   * no base, and the server may have moved on since.
   */
  start() {
    this.closed = false;
    this.outbox = [];
    this.base.clear();
    this.seen.clear();
    this.baseProject = null;
    this.serverConfirmed = false;
    this.inFlight = null;
    this.setStatus({ kind: "loading" });
    runInAction(() => this.project.clearRows());
    this.disposeReaction = reaction(
      () => this.snapshotKey(),
      () => this.schedule(SYNC_DEBOUNCE_MS),
    );
  }

  /**
   * Stops watching, and sends any unsaved edits straight away (a batch
   * already out finishes, then the rest go). Called when the project closes.
   */
  close() {
    this.disposeReaction?.();
    this.disposeReaction = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // The unsaved edits as they are now, detached from the models: once
    // closed, this syncer never reads the project again (it may be reopened,
    // with its rows cleared, while these are still going out).
    this.outbox = this.serverConfirmed
      ? orderForBatches(this.computeChanges())
      : [];
    this.closed = true;
    void this.drainOutbox();
  }

  /** Sends a closed project's outbox, a batch at a time, then stops. */
  private async drainOutbox() {
    if (this.inFlight) return; // the batch that's out drains the rest after
    const batch = splitBatch(this.outbox).batch;
    if (batch.length === 0) return;
    this.outbox = this.outbox.slice(batch.length);
    this.inFlight = new Map();
    try {
      await this.send(batch);
    } catch (error) {
      console.error("Couldn't save a closed project's last edits:", error);
      this.outbox = [];
    } finally {
      this.inFlight = null;
    }
    await this.drainOutbox();
  }

  /** Whether some edit hasn't reached the server yet. */
  hasUnsavedChanges(): boolean {
    return this.inFlight !== null || this.computeChanges().length > 0;
  }

  /**
   * The server's rows. `confirmed` is false for a copy from the browser's
   * cache, which shows straight away but isn't a base to save against.
   */
  applyServerData(
    data: ProjectData,
    project: Doc<"projects">,
    confirmed: boolean,
  ) {
    this.server = data;
    this.serverProject = project;
    const wasConfirmed = this.serverConfirmed;
    this.serverConfirmed = this.serverConfirmed || confirmed;
    this.mergeServer();
    if (this.serverConfirmed && !wasConfirmed) {
      this.setStatus(
        this.computeChanges().length ? { kind: "saving" } : { kind: "saved" },
      );
      this.schedule(0);
    }
  }

  /** Sends whatever's unsaved now, without waiting for the debounce. */
  flush() {
    if (this.serverConfirmed && this.computeChanges().length)
      this.setStatus({ kind: "saving" });
    this.schedule(0);
  }

  // ------------------------------------------------------------- internals

  private setStatus(status: SaveStatus) {
    this.status = status;
  }

  private localRows(): Map<string, Row> {
    const rows = new Map<string, Row>();
    const add = (
      table: EditorTable,
      models: Array<{ key: string; doc: { key: string; projectId: string } }>,
    ) => {
      for (const model of models) {
        const doc = fieldsOf(toJS(model.doc));
        rows.set(rowId(table, model.key), {
          table,
          key: model.key,
          json: stableStringify(doc),
          doc,
        });
      }
    };
    add("nodes", this.project.nodes);
    add("sequences", this.project.sequences);
    add("playlists", this.project.playlists);
    return rows;
  }

  private localProjectJson() {
    return stableStringify(projectFields(toJS(this.project.doc)));
  }

  /** Changes whenever any row or the project's own fields change. */
  private snapshotKey() {
    return (
      [...this.localRows().values()]
        .map((r) => `${r.table}:${r.key}:${r.json}`)
        .join("\n") + this.localProjectJson()
    );
  }

  private computeChanges(): SyncChange[] {
    const changes: SyncChange[] = [];
    const local = this.localRows();
    for (const [id, row] of local)
      if (
        this.base.get(id) !== row.json &&
        (this.base.has(id) || !this.seen.has(id))
      )
        changes.push({
          table: row.table,
          op: this.base.has(id) ? "update" : "create",
          key: row.key,
          doc: row.doc,
        } as SyncChange);
    for (const id of this.base.keys())
      if (!local.has(id)) {
        const [table, key] = splitId(id);
        changes.push({ table, op: "delete", key });
      }
    if (
      this.baseProject !== null &&
      this.localProjectJson() !== this.baseProject
    )
      changes.push({
        table: "projects",
        op: "update",
        doc: projectFields(toJS(this.project.doc)),
      });
    return changes;
  }

  private schedule(ms: number) {
    if (!this.serverConfirmed || this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    if (this.computeChanges().length && this.status.kind !== "error")
      this.setStatus({ kind: "saving" });
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sendBatch();
    }, ms);
  }

  private async sendBatch() {
    // Never two in flight: this one's answer schedules the next.
    if (this.inFlight) return;
    if (this.closed) return this.drainOutbox();
    const changes = this.takeBatch();
    if (changes.length === 0) {
      if (this.status.kind !== "error") this.setStatus({ kind: "saved" });
      return;
    }
    const sent = new Map<string, string | null>();
    for (const change of changes)
      if (change.table === "projects")
        sent.set("projects", stableStringify(change.doc));
      else
        sent.set(
          rowId(change.table, change.key),
          change.op === "delete" ? null : stableStringify(change.doc),
        );
    this.inFlight = sent;
    this.setStatus({ kind: "saving" });

    try {
      const result = await this.send(changes);
      runInAction(() => this.settle(sent, result));
    } catch (error) {
      runInAction(() => {
        this.inFlight = null;
        if (this.closed) {
          void this.drainOutbox();
          return;
        }
        const delay =
          RETRY_DELAYS_MS[
            Math.min(this.failures, RETRY_DELAYS_MS.length - 1)
          ] ?? 30_000;
        this.failures++;
        this.setStatus({
          kind: "error",
          message: errorMessage(error),
          retryAt: Date.now() + delay,
        });
        this.schedule(delay);
      });
      return;
    }
    this.failures = 0;
    if (this.closed) return this.drainOutbox();
    if (this.computeChanges().length) this.schedule(SYNC_DEBOUNCE_MS);
    else this.setStatus({ kind: "saved" });
  }

  /**
   * The next batch: changes up to MAX_BATCH_BYTES. A row too big for Convex
   * to store is never sent (it would fail every batch it's in): it goes back
   * to the server's version, and the editor says why.
   */
  private takeBatch(): SyncChange[] {
    const { batch, tooBig } = splitBatch(
      orderForBatches(this.computeChanges()),
    );
    for (const change of tooBig)
      if (change.table !== "projects" && change.op !== "delete")
        this.revert(
          rowId(change.table, change.key),
          stableStringify(change.doc),
        );
    if (tooBig.length)
      this.lastProblems = tooBig.map((change) => ({
        table: change.table,
        key: "key" in change ? change.key : "",
        reason: `It's too big to store: a row can be at most ${LIMITS.rowBytes / 1000} KB.`,
      }));
    return batch;
  }

  /** A batch's answer: the sent rows are now the base, and refused ones go back to the server's. */
  private settle(sent: Map<string, string | null>, result: SyncResult) {
    this.inFlight = null;
    const refused = new Set(
      [...result.skipped, ...result.rejected].map((r) =>
        rowId(r.table as EditorTable, r.key),
      ),
    );
    for (const [id, json] of sent) {
      if (id === "projects") {
        this.baseProject = json;
        continue;
      }
      if (refused.has(id)) {
        // A closed project's rows are reloaded when it opens again.
        if (!this.closed) this.revert(id, json);
        continue;
      }
      if (json === null) this.base.delete(id);
      else {
        this.base.set(id, json);
        this.seen.add(id);
      }
    }
    this.lastProblems = [...result.skipped, ...result.rejected];
    if (this.closed) return;
    // The server may have repaired rows we sent (a trimmed segment, a moved
    // child); take its version of any row with no newer edits.
    this.mergeServer();
  }

  /**
   * Puts a row back as the server has it, unless it was edited again since.
   * A row the server doesn't have was deleted elsewhere: it goes, edits or
   * not, as sending it again would bring it back.
   */
  private revert(id: string, sentJson: string | null) {
    const local = this.localRows().get(id);
    const editedSince = (local?.json ?? null) !== sentJson;
    const serverRow = this.serverRows().get(id);
    if (serverRow) this.base.set(id, serverRow.json);
    else this.base.delete(id);
    if (!editedSince || !serverRow) this.adopt(id, serverRow);
  }

  private serverRows(): Map<string, Row & { full: object }> {
    const rows = new Map<string, Row & { full: object }>();
    if (!this.server) return rows;
    const add = <T extends EditorTable>(table: T, docs: Doc<T>[]) => {
      for (const doc of docs) {
        const full = toEditorDoc(doc) as unknown as {
          key: string;
          projectId: string;
        };
        const fields = fieldsOf(full);
        rows.set(rowId(table, full.key), {
          table,
          key: full.key,
          json: stableStringify(fields),
          doc: fields,
          full,
        });
      }
    };
    add("nodes", this.server.nodes);
    add("sequences", this.server.sequences);
    add("playlists", this.server.playlists);
    return rows;
  }

  /** Takes the server's version of every row that has no unsaved edits. */
  private mergeServer() {
    const server = this.serverRows();
    const local = this.localRows();
    for (const id of new Set([
      ...server.keys(),
      ...local.keys(),
      ...this.base.keys(),
    ])) {
      if (this.inFlight?.has(id)) continue;
      const base = this.base.get(id);
      const localJson = local.get(id)?.json;
      const serverRow = server.get(id);
      // Seen on the server, then deleted there: it goes, unsaved edits or not.
      if (
        base === undefined &&
        localJson !== undefined &&
        this.seen.has(id) &&
        !serverRow
      ) {
        this.adopt(id, undefined);
        continue;
      }
      if (localJson !== base) continue; // unsaved edits win
      if (serverRow) {
        this.base.set(id, serverRow.json);
        this.seen.add(id);
      } else this.base.delete(id);
      if (localJson !== serverRow?.json) this.adopt(id, serverRow);
    }

    if (this.serverProject && !this.inFlight?.has("projects")) {
      const serverJson = stableStringify(projectFields(this.serverProject));
      if (
        this.baseProject === null ||
        this.localProjectJson() === this.baseProject
      ) {
        this.baseProject = serverJson;
        if (this.localProjectJson() !== serverJson)
          this.project.doc = {
            ...this.project.doc,
            ...projectFields(this.serverProject),
          };
      } else this.baseProject = serverJson;
    }
  }

  /** Makes the local model match the server's row (or removes it). */
  private adopt(id: string, row: (Row & { full: object }) | undefined) {
    const [table, key] = splitId(id);
    const list = this.project[table] as Array<{
      key: string;
      doc: object;
      kind?: string;
    }>;
    const index = list.findIndex((m) => m.key === key);
    if (!row) {
      if (index >= 0) list.splice(index, 1);
      return;
    }
    const full = structuredClone(row.full) as never;
    const existing = list[index];
    if (
      existing &&
      (table !== "nodes" ||
        existing.kind === (row.full as { kind: string }).kind)
    ) {
      existing.doc = full;
      return;
    }
    const model =
      table === "nodes"
        ? this.project.createNodeModel(full)
        : table === "sequences"
          ? this.project.createSequenceModel(full)
          : this.project.createPlaylistModel(full);
    if (index >= 0) list[index] = model;
    else list.push(model);
  }
}

/** A change's size as JSON (Infinity when it can't be JSON). */
const sizeOf = (change: SyncChange) => {
  if (!("doc" in change)) return 100;
  try {
    return JSON.stringify(change.doc).length;
  } catch {
    return Infinity;
  }
};

/**
 * The next batch, up to MAX_BATCH_BYTES, and the rows too big to ever send
 * (they'd fail every batch they're in).
 */
const splitBatch = (changes: SyncChange[]) => {
  const batch: SyncChange[] = [];
  const tooBig: SyncChange[] = [];
  let bytes = 0;
  for (const change of changes) {
    const size = sizeOf(change);
    if (size > LIMITS.rowBytes) {
      tooBig.push(change);
      continue;
    }
    if (batch.length > 0 && bytes + size > MAX_BATCH_BYTES) break;
    batch.push(change);
    bytes += size;
  }
  return { batch, tooBig };
};

/**
 * Changes in an order that's safe to cut into batches: every row is created
 * before anything that points at it, so a reference never reaches the server
 * ahead of its target (which would repair it away). Folders go outermost
 * first, then strings and switches, then virtual strings; then node updates,
 * sequences, playlists and the project; deletes last.
 */
export const orderForBatches = (changes: SyncChange[]): SyncChange[] => {
  const createdFolders = new Map<string, string | null>();
  for (const c of changes)
    if (c.table === "nodes" && c.op === "create" && c.doc.kind === "folder")
      createdFolders.set(c.key, c.doc.parentId);
  const depth = (key: string) => {
    let d = 0;
    let parent = createdFolders.get(key) ?? null;
    while (parent !== null && createdFolders.has(parent) && d < 1000) {
      d++;
      parent = createdFolders.get(parent) ?? null;
    }
    return d;
  };
  const rank = (c: SyncChange): number => {
    if (c.op === "delete")
      return c.table === "playlists" ? 20 : c.table === "sequences" ? 21 : 22;
    if (c.table === "nodes" && c.op === "create") {
      if (c.doc.kind === "folder") return depth(c.key) / 2000;
      return c.doc.kind === "virtual_string" ? 2 : 1;
    }
    if (c.table === "nodes") return 3;
    if (c.table === "sequences") return 4;
    if (c.table === "playlists") return 5;
    return 6;
  };
  return changes
    .map((change, index) => ({ change, index, rank: rank(change) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ change }) => change);
};

const splitId = (id: string): [EditorTable, string] => {
  const at = id.indexOf(":");
  return [id.slice(0, at) as EditorTable, id.slice(at + 1)];
};

const errorMessage = (error: unknown): string => {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data: unknown }).data;
    if (data && typeof data === "object" && "message" in data)
      return String((data as { message: unknown }).message);
  }
  return error instanceof Error ? error.message : String(error);
};
