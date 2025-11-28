/* eslint-disable react-refresh/only-export-components */
import { useEffect } from "react";
import type { WebSocket, RawData } from "ws";
import { WebSocketServer } from "ws";
import { Signal } from "../shared/Signal";
import type { Id } from "../convex/_generated/dataModel";

const CONTROL_PORT = Number(process.env.BUN_WS_PORT ?? 8787);

export const onFrameDataSignal = new Signal<{
  forStringId: Id<"nodes">;
  rgb: Uint8Array;
}>();

export const ClientDataSocket = () => {
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
        onFrameDataSignal.dispatch({
          forStringId: id as Id<"nodes">,
          rgb: rgbBytes,
        });
      });
    });
    console.log(`WS listening on ws://localhost:${CONTROL_PORT}`);

    return () => {
      console.log(`WS closing..`);
      wssControl.close();
    };
  }, []);

  return null;
};
