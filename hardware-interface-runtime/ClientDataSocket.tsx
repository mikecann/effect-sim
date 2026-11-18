import type { NodeKey } from "../shared/models/docs";
import { useEffect } from "react";
import type { IncomingMessage } from "node:http";
import type { WebSocket, RawData } from "ws";
import { WebSocketServer } from "ws";
import { timingSafeEqual } from "node:crypto";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { observer } from "mobx-react-lite";
import { logger } from "./utils/logger";

const CONTROL_PORT = Number(process.env.BUN_WS_PORT ?? 8787);
// Optional: when set, a client must connect with ?token=<this>.
const SOCKET_TOKEN = process.env.HWIR_WS_TOKEN || null;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Only the editor running on this Mac may drive the lights: the server
 * listens on localhost only, refuses pages served from anywhere else (any
 * website could otherwise open a socket to localhost), and checks
 * HWIR_WS_TOKEN when it's set.
 */
const allowed = (req: IncomingMessage) => {
  const origin = req.headers.origin;
  if (origin && !URL.canParse(origin)) return false;
  if (origin && !LOCAL_HOSTS.has(new URL(origin).hostname)) return false;
  if (!SOCKET_TOKEN) return true;
  const token = new URL(req.url ?? "/", "http://localhost").searchParams.get(
    "token",
  );
  return token !== null && sameToken(token, SOCKET_TOKEN);
};

/**
 * Listen mode (no playlist): the editor on this Mac streams its frames here
 * (src/common/models/HardwareInterfaceRuntimeModel.ts) and HWIR forwards them
 * to the strings. Each binary message is 0x01, the string key's length, the
 * key, then RGB bytes.
 */
export const ClientDataSocket = observer(({ app }: { app: HWIRAppModel }) => {
  useEffect(() => {
    const wssControl = new WebSocketServer({
      host: "127.0.0.1",
      port: CONTROL_PORT,
      verifyClient: ({ req }: { req: IncomingMessage }) => {
        const ok = allowed(req);
        if (!ok)
          logger.warn(
            `Refused a socket from origin ${req.headers.origin ?? "(none)"}`,
          );
        return ok;
      },
    });

    wssControl.on("connection", (socket: WebSocket) => {
      socket.on("message", (data: RawData, isBinary: boolean) => {
        if (!isBinary) return;

        const buffer = data as Buffer;
        if (buffer.byteLength < 2) return;
        const u8 = new Uint8Array(
          buffer.buffer,
          buffer.byteOffset,
          buffer.byteLength,
        );
        const opcode = u8[0];
        if (opcode !== 0x01) return;
        const idLen = u8[1];
        const start = 2;
        const end = start + idLen;
        if (u8.byteLength < end) return;
        const id = new TextDecoder().decode(u8.subarray(start, end));
        const rgbBytes = u8.subarray(end);

        void app.links.get(id as NodeKey)?.send(rgbBytes);
      });
    });
    logger.info(`Listen mode: WS on ws://127.0.0.1:${CONTROL_PORT}`);

    return () => {
      logger.info(`WS closing..`);
      wssControl.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one server for HWIR's life; each message reads app.links as it is then.
  }, []);

  return null;
});
