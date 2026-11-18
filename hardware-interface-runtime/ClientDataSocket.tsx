import type { NodeKey } from "../shared/models/docs";
import { useEffect } from "react";
import type { WebSocket, RawData } from "ws";
import { WebSocketServer } from "ws";
import { HWIRAppModel } from "./models/HWIRAppModel";
import { observer } from "mobx-react-lite";
import { logger } from "./utils/logger";

const CONTROL_PORT = Number(process.env.BUN_WS_PORT ?? 8787);

export const ClientDataSocket = observer(({ app }: { app: HWIRAppModel }) => {
  useEffect(() => {
    const wssControl = new WebSocketServer({ port: CONTROL_PORT });

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

        const string = app.stringsMap.get(id as NodeKey);
        if (!string) return;
        string.onData.dispatch(rgbBytes);
      });
    });
    logger.info(`WS listening on ws://localhost:${CONTROL_PORT}`);

    return () => {
      logger.info(`WS closing..`);
      wssControl.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one server for HWIR's life; each message reads app.stringsMap as it is then.
  }, []);

  return null;
});
