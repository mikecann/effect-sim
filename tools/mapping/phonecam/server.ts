// Phone camera for the mapping session: the phone opens this page in Safari
// (over Tailscale HTTPS, which getUserMedia needs), picks a lens, and stays on
// a table pointed at the house. The capture tool asks this server for photos
// (GET /snap) and the server asks the phone for its next video frame.
//
//   bun tools/mapping/phonecam/server.ts [--port 18731]
//   tailscale serve --bg --set-path /phonecam http://127.0.0.1:18731
//
// Then open https://<this mac>.ts.net/phonecam/ on the phone.
//
// Guide mode: someone walks round holding the phone while the agent on the
// Mac looks through it and tells them where to go. POST /say shows the words
// big on the phone and reads them out; the phone's quick replies and typed
// (or dictated) answers come back from GET /replies. Both only answer the Mac
// itself, not requests through Tailscale. tools/mapping/phonecam/guide.ts
// wraps them.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ServerWebSocket } from "bun";

const portArg = process.argv.indexOf("--port");
const port = portArg > 0 ? Number(process.argv[portArg + 1]) : 18731;
const latestDir = "/tmp/phonecam";
mkdirSync(latestDir, { recursive: true });

const page = await Bun.file(join(import.meta.dir, "page.html")).text();

type PhoneInfo = Record<string, unknown>;
let phone: ServerWebSocket<unknown> | undefined;
let info: PhoneInfo = {};
let nextId = 1;
const pendingSnaps = new Map<
  number,
  { resolve: (b: Uint8Array<ArrayBuffer>) => void; reject: (e: Error) => void }
>();
const pendingCommands = new Map<number, (r: PhoneInfo) => void>();

// A 4032x3024 JPEG at quality 0.95 is about 3-8 MB.
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

// Guide mode: the latest instruction, and what the person holding the phone
// sent back.
type Said = { id: number; text: string; at: number };
let said: Said | null = null;
const replies: Said[] = [];
let nextReplyId = 1;
const replyWaiters = new Set<() => void>();
const MAX_TEXT = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ask = <T>(
  msg: Record<string, unknown>,
  register: (id: number) => Promise<T>,
  timeoutMs: number,
) => {
  if (!phone)
    throw new Error("No phone connected. Open the page on the phone.");
  const id = nextId++;
  const result = register(id);
  phone.send(JSON.stringify({ ...msg, id }));
  return Promise.race([
    result,
    sleep(timeoutMs).then(() => {
      pendingSnaps.delete(id);
      pendingCommands.delete(id);
      throw new Error(`The phone didn't answer within ${timeoutMs} ms.`);
    }),
  ]);
};

const snap = (settleMs: number) =>
  sleep(settleMs).then(() =>
    ask(
      { type: "snap" },
      (id) =>
        new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) =>
          pendingSnaps.set(id, { resolve, reject }),
        ),
      15_000,
    ),
  );

const command = (type: string) =>
  ask(
    { type },
    (id) => new Promise<PhoneInfo>((r) => pendingCommands.set(id, r)),
    10_000,
  );

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// Tailscale serve may or may not strip the /phonecam prefix, so route on the
// last path segment.
const route = (url: URL) => url.pathname.replace(/^.*\//, "");

Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(req, server) {
    const url = new URL(req.url);
    const r = route(url);
    try {
      if (r === "ws") {
        if (server.upgrade(req)) return undefined;
        return new Response("Expected a WebSocket", { status: 400 });
      }
      if (r === "" || r === "phonecam")
        return new Response(page, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      if (r === "status") return json({ connected: !!phone, ...info });
      if (r === "say" || r === "replies") {
        // From the Mac only: tailscale serve marks the requests it forwards.
        if (req.headers.has("tailscale-user-login"))
          return json({ ok: false, error: "Only from the Mac" }, 403);
        if (r === "say" && req.method === "POST") {
          const body = (await req.json().catch(() => ({}))) as { text?: unknown };
          const text = String(body.text ?? "").trim().slice(0, MAX_TEXT);
          if (!text) return json({ ok: false, error: "Nothing to say" }, 400);
          said = { id: (said?.id ?? 0) + 1, text, at: Date.now() };
          phone?.send(JSON.stringify({ type: "say", ...said }));
          return json({ ok: true, delivered: !!phone, id: said.id });
        }
        if (r === "replies") {
          // Long poll: replies after `after`, waiting up to `wait` seconds for one.
          const after = Number(url.searchParams.get("after") ?? 0);
          const waitMs = Math.min(Number(url.searchParams.get("wait") ?? 0), 600) * 1000;
          const newer = () => replies.filter((m) => m.id > after);
          if (newer().length === 0 && waitMs > 0)
            await new Promise<void>((resolve) => {
              const done = () => { replyWaiters.delete(done); clearTimeout(timer); resolve(); };
              const timer = setTimeout(done, waitMs);
              replyWaiters.add(done);
            });
          return json({ connected: !!phone, replies: newer() });
        }
      }
      if (r === "upload" && req.method === "POST") {
        // Only a photo the capture asked for, and only photo-sized: anything
        // else is refused before its body is read.
        const id = Number(url.searchParams.get("id"));
        const pending = pendingSnaps.get(id);
        if (!pending) return json({ ok: false, error: "No photo asked for with that id" }, 409);
        const length = Number(req.headers.get("content-length") ?? NaN);
        if (!(length > 0 && length <= MAX_PHOTO_BYTES))
          return json({ ok: false, error: "Photo missing or too big" }, 413);
        pendingSnaps.delete(id);
        const bytes = new Uint8Array(await req.arrayBuffer());
        if (bytes.length > MAX_PHOTO_BYTES) {
          pending.reject(new Error("The phone sent a photo that was too big."));
          return json({ ok: false, error: "Photo too big" }, 413);
        }
        writeFileSync(join(latestDir, "latest.jpg"), bytes);
        pending.resolve(bytes);
        return json({ ok: true });
      }
      if (r === "snap") {
        const bytes = await snap(Number(url.searchParams.get("settle") ?? 0));
        return new Response(bytes, {
          headers: { "content-type": "image/jpeg" },
        });
      }
      if (r === "lock" || r === "auto") return json(await command(r));
      return new Response("Not found", { status: 404 });
    } catch (e) {
      return json({ ok: false, error: (e as Error).message }, 503);
    }
  },
  websocket: {
    open(ws) {
      if (phone && phone !== ws) phone.close(4000, "Another phone connected");
      phone = ws;
      console.log("phone connected");
      if (said) ws.send(JSON.stringify({ type: "say", ...said }));
    },
    message(ws, raw) {
      const msg = JSON.parse(String(raw)) as PhoneInfo & {
        type: string;
        id?: number;
      };
      if (msg.type === "info") {
        info = msg;
        console.log("phone:", JSON.stringify(msg));
      } else if (msg.type === "result" && msg.id !== undefined) {
        pendingCommands.get(msg.id)?.(msg);
        pendingCommands.delete(msg.id);
      } else if (msg.type === "reply") {
        const text = String(msg.text ?? "").trim().slice(0, MAX_TEXT);
        if (!text) return;
        replies.push({ id: nextReplyId++, text, at: Date.now() });
        if (replies.length > 200) replies.shift();
        console.log("reply:", text);
        for (const wake of [...replyWaiters]) wake();
      } else if (msg.type === "snapError" && msg.id !== undefined) {
        pendingSnaps.get(msg.id)?.reject(new Error(String(msg.error)));
        pendingSnaps.delete(msg.id);
      }
    },
    close(ws) {
      if (phone === ws) {
        phone = undefined;
        console.log("phone disconnected");
      }
    },
  },
});

console.log(`phonecam on http://127.0.0.1:${port}/`);
