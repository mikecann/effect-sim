import dgram from "dgram";
import { runInAction } from "mobx";
import { WLEDClient } from "wled-client";
import { iife } from "../../shared/misc";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

// DDP Protocol constants
// Byte 0 is Flags/Version: high nibble = version (0x4 -> v1), low nibble = flags (bit0 = PUSH)
const VER1 = 0x40; // version 1 in high nibble
const FLAG_PUSH = 0x01; // push flag
const DATA_TYPE = 0x01; // Data type RGB
const OUTPUT_ID = 0x01; // Default ID for output device

export const createAndConnectWLEDDDP = async ({
  host,
  port,
}: {
  host: string;
  port: number;
}) => {
  console.log(`WLED DDP connecting to ${host}:${port}`);
  const socket = dgram.createSocket("udp4");
  const client = new WLEDClient({
    host,
    websocket: false,
  });
  socket.on("close", () => {
    console.log(`dgram socket on.close event to ${host}:${port}`);
  });
  await client.init();
  await client.turnOn();

  console.log(`WLED DDP connection initialized to ${host}:${port}`);

  let isClosedOrClosing = false;

  return {
    async send(rgbBytes: Uint8Array): Promise<void> {
      return new Promise((resolve, reject) => {
        if (isClosedOrClosing) return;

        const packet = iife(() => {
          const header = Buffer.alloc(10); // DDP header is 10 bytes
          header[0] = VER1 | FLAG_PUSH; // version + PUSH flag
          header[1] = 0x00; // Reserved for future use, set to 0.
          header[2] = DATA_TYPE;
          header[3] = OUTPUT_ID;
          header.writeUInt32BE(0, 4); // Offset set to 0
          header.writeUInt16BE(rgbBytes.length, 8); // Data length

          const data = Buffer.from(rgbBytes);

          return Buffer.concat([header, data]);
        });

        socket.send(
          packet,
          0,
          packet.length,
          port,
          host,
          (error: Error | null, _bytes: number) => {
            if (error) {
              const dataSize = packet.length - 10; // Subtract DDP header size
              reject(
                new Error(
                  `Error sending packet of ${dataSize} bytes to ${host}:${port}`,
                ),
              );
              return;
            }
            resolve();
          },
        );
      });
    },

    async setBrightness(brightness: number): Promise<void> {
      if (isClosedOrClosing) return;
      await client.setBrightness(clamp(brightness, 0, 255));
    },

    async close(): Promise<void> {
      if (isClosedOrClosing) return;
      isClosedOrClosing = true;
      console.log(`Closing WLEDDdp connection to ${host}:${port}`);
      socket.close();
      await client.turnOff();
      console.log(`Closed WLEDDdp connection to ${host}:${port}`);
    },
  };
};

export type WLEDDDPConnection = Awaited<
  ReturnType<typeof createAndConnectWLEDDDP>
>;
