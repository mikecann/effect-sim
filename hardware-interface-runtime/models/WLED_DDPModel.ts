import dgram from "dgram";
import { makeAutoObservable, runInAction } from "mobx";
import { WLEDClient } from "wled-client";
import { iife } from "../../shared/misc";

/**
 * Represents an RGB color value for an LED
 * [red, green, blue] where each value is 0-255
 */
export type Led = readonly [number, number, number];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

// DDP Protocol constants
// Byte 0 is Flags/Version: high nibble = version (0x4 -> v1), low nibble = flags (bit0 = PUSH)
const VER1 = 0x40; // version 1 in high nibble
const FLAG_PUSH = 0x01; // push flag
const DATA_TYPE = 0x01; // Data type RGB
const OUTPUT_ID = 0x01; // Default ID for output device

type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "close_requested"
  | "closing";

/**
 * Client for controlling WLED devices using the DDP (Distributed Display Protocol)
 * Provides methods for sending color data and controlling LED settings
 */
export class WLED_DDPModel {
  socket: dgram.Socket | null = null;
  client: WLEDClient | null = null;
  status: ConnectionStatus = "disconnected";

  constructor(
    private host: string,
    private port: number,
  ) {
    makeAutoObservable(this, {
      socket: false,
      client: false,
    });
  }

  async connect(): Promise<void> {
    if (this.status !== "disconnected")
      throw new Error(
        `Cannot start connecting to ${this.host}:${this.port} because it is already '${this.status}'`,
      );
    console.log(`WLEDDdp connection initializing to ${this.host}:${this.port}`);
    this.status = "connecting";
    this.socket = dgram.createSocket("udp4");
    this.client = new WLEDClient({
      host: this.host,
      websocket: false,
    });
    this.socket.on("close", () => {
      console.log(`WLEDDdp socket closed to ${this.host}:${this.port}`);
      runInAction(() => {
        this.status = "disconnected";
      });
    });
    await this.client.init();
    await this.client.turnOn();
    const statusNow = `${this.status}`;
    runInAction(() => {
      this.status = "connected";
    });
    console.log(`WLEDDdp connected to ${this.host}:${this.port}`);
    if (statusNow == "close_requested") {
      console.log(
        `WLEDDdp connection to ${this.host}:${this.port} was requested to close during connecting, closing now`,
      );
      this.close();
    }
  }

  async send(rgbBytes: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.status !== "connected")
        throw new Error(
          `Cannot send data to ${this.host}:${this.port} because it is not 'connected' it is '${this.status}'`,
        );
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

      this.socket?.send(
        packet,
        0,
        packet.length,
        this.port,
        this.host,
        (error: Error | null, _bytes: number) => {
          if (error) {
            const dataSize = packet.length - 10; // Subtract DDP header size
            reject(
              new Error(
                `Error sending packet of ${dataSize} bytes to ${this.host}:${this.port}`,
              ),
            );
            return;
          }
          resolve();
        },
      );
    });
  }

  async setBrightness(brightness: number): Promise<void> {
    if (this.status !== "connected")
      throw new Error(
        `Cannot set brightness to ${brightness} for ${this.host}:${this.port} because it is not 'connected' it is '${this.status}'`,
      );
    await this.client?.setBrightness(clamp(brightness, 0, 255));
  }

  async close(): Promise<void> {
    if (this.status == "disconnected") return;
    if (this.status == "close_requested") return;
    if (this.status == "connecting") {
      this.status = "close_requested";
      return;
    }
    if (this.status == "closing") return;
    this.status = "closing";
    this.socket?.close();
    await this.client?.turnOff();
    runInAction(() => {
      this.status = "disconnected";
    });
    console.log(`WLEDDdp connection closed to ${this.host}:${this.port}`);
  }
}
