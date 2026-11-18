// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import dgram from "node:dgram";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { StringLink } from "./StringLink";

/** A stand-in WLED board on localhost: its JSON API and a DDP socket. */
const fakeWled = async () => {
  const posted: unknown[] = [];
  const packets: Buffer[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/json/state" && req.method === "POST")
        posted.push(JSON.parse(body));
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ uptime: 100 }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const udp = dgram.createSocket("udp4");
  udp.on("message", (msg) => packets.push(msg));
  await new Promise<void>((r) => udp.bind(0, "127.0.0.1", r));
  return {
    httpBase: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    port: udp.address().port,
    posted,
    packets,
    close: () => {
      server.close();
      udp.close();
    },
  };
};

const until = async (check: () => boolean, ms = 3_000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
};

let cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.forEach((c) => c());
  cleanup = [];
});

describe("StringLink", () => {
  it("goes live on a good probe, puts on and brightness back, and sends chunked DDP", async () => {
    const wled = await fakeWled();
    cleanup.push(wled.close);
    const link = new StringLink({
      host: "127.0.0.1",
      port: wled.port,
      name: () => "test",
      brightness: () => 300, // clamped to 255
      httpBase: wled.httpBase,
    });
    cleanup.push(() => link.close());

    expect(await link.send(new Uint8Array(3))).toBe("unreachable");
    await until(() => link.state.kind === "live");
    await until(() => wled.posted.length > 0);
    expect(wled.posted[0]).toEqual({ on: true, bri: 255 });

    const frame = Uint8Array.from({ length: 600 * 3 }, (_, i) => i % 256);
    expect(await link.send(frame)).toBe("sent");
    await until(() => wled.packets.length === 2);
    expect(wled.packets.map((p) => [p[0], p.readUInt32BE(4)])).toEqual([
      [0x40, 0],
      [0x41, 1440],
    ]);
  });

  it("reports a board that doesn't answer as offline, sending nothing", async () => {
    const link = new StringLink({
      host: "127.0.0.1",
      port: 9,
      name: () => "nobody",
      brightness: () => 128,
      httpBase: "http://127.0.0.1:1", // nothing listens there
    });
    cleanup.push(() => link.close());
    await until(
      () => link.state.kind === "connecting" && link.state.failures > 0,
    );
    expect(await link.send(new Uint8Array(3))).toBe("unreachable");
  });
});
