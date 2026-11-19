// Talk to whoever is holding the phone camera (guide mode in server.ts).
//
//   bun tools/mapping/phonecam/guide.ts say "Walk to the left barrel"
//   bun tools/mapping/phonecam/guide.ts wait [seconds]   # their next reply
//   bun tools/mapping/phonecam/guide.ts look [file.jpg]  # a photo, plus a 1600 px copy to view
//
// PHONECAM_URL overrides http://127.0.0.1:18731. `wait` remembers the last
// reply it printed in /tmp/phonecam/last-reply, so each call gets new ones.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const base = process.env.PHONECAM_URL ?? "http://127.0.0.1:18731";
const stateDir = "/tmp/phonecam";
const lastFile = `${stateDir}/last-reply`;
mkdirSync(stateDir, { recursive: true });

const [command, ...rest] = process.argv.slice(2);

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

if (command === "say") {
  const text = rest.join(" ").trim();
  if (!text) fail('Say what? guide.ts say "…"');
  const res = await fetch(`${base}/say`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const body = (await res.json()) as { ok: boolean; delivered?: boolean; error?: string };
  if (!body.ok) fail(body.error ?? `say failed (${res.status})`);
  console.log(body.delivered ? "Shown on the phone." : "No phone connected: it'll show when the page reconnects.");
} else if (command === "wait") {
  const seconds = Number(rest[0] ?? 120);
  const after = existsSync(lastFile) ? Number(readFileSync(lastFile, "utf8")) : 0;
  const res = await fetch(`${base}/replies?after=${after}&wait=${seconds}`);
  const body = (await res.json()) as {
    connected: boolean;
    replies: { id: number; text: string; at: number }[];
  };
  if (body.replies.length === 0)
    console.log(body.connected ? `No reply in ${seconds} s.` : "No reply, and no phone connected.");
  for (const r of body.replies)
    console.log(`${new Date(r.at).toLocaleTimeString()}  ${r.text}`);
  const last = body.replies.at(-1);
  if (last) writeFileSync(lastFile, String(last.id));
} else if (command === "look") {
  const out = rest[0] ?? `${stateDir}/look.jpg`;
  const res = await fetch(`${base}/snap?settle=300`);
  if (!res.ok) fail(`No photo: ${await res.text()}`);
  writeFileSync(out, new Uint8Array(await res.arrayBuffer()));
  const small = out.replace(/\.jpe?g$/i, "") + "-small.jpg";
  spawnSync("sips", ["-Z", "1600", out, "--out", small], { stdio: "ignore" });
  console.log(`${out}\n${small}`);
} else 
  fail("guide.ts say <words> | wait [seconds] | look [file.jpg]");

