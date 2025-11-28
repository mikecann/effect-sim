import dgram from "dgram";
import { WLEDClient } from "wled-client";

/**
 * Represents an RGB color value for an LED
 * [red, green, blue] where each value is 0-255
 */
export type Led = readonly [number, number, number];

/**
 * Configuration options for WLEDDdp client
 */
export interface WLEDDdpOptions {
  /** The hostname or IP address of the WLED device */
  readonly host: string;
  /** The port number for DDP communication (default is 4048) */
  readonly port: number;
  /** Whether to automatically turn on LEDs if they're off initially */
  readonly autoTurnOn?: boolean;
  /** Number of LEDs in the strip */
  readonly ledCount?: number;
}

/**
 * Client for controlling WLED devices using the DDP (Distributed Display Protocol)
 * Provides methods for sending color data and controlling LED settings
 */
export class WLEDDdp {
  private readonly _socket: dgram.Socket;
  private readonly _port: number;
  private readonly _host: string;
  private readonly _ledCount: number;

  private readonly jsonClient: WLEDClient;

  // DDP Protocol constants
  // Byte 0 is Flags/Version: high nibble = version (0x4 -> v1), low nibble = flags (bit0 = PUSH)
  private readonly VER1 = 0x40; // version 1 in high nibble
  private readonly FLAG_PUSH = 0x01; // push flag
  private readonly DATA_TYPE = 0x01; // Data type RGB
  private readonly OUTPUT_ID = 0x01; // Default ID for output device

  /**
   * Creates a new WLEDDdp client
   * @param options Configuration options for the client
   */
  constructor(options: WLEDDdpOptions);
  /**
   * Creates a new WLEDDdp client (legacy constructor)
   * @param host The hostname or IP address of the WLED device
   * @param port The port number for DDP communication
   * @deprecated Use the options object constructor instead
   */
  constructor(host: string, port: number);
  constructor(hostOrOptions: string | WLEDDdpOptions, port?: number) {
    if (typeof hostOrOptions === "string") {
      this._host = hostOrOptions;
      this._port = port ?? 4048;
      this._ledCount = 250;
    } else {
      this._host = hostOrOptions.host;
      this._port = hostOrOptions.port;
      this._ledCount = hostOrOptions.ledCount ?? 250;
    }

    this._socket = dgram.createSocket("udp4");
    this.jsonClient = new WLEDClient({
      host: this._host,
      websocket: false,
    });
  }

  /**
   * Initializes the LED connection and turns on the LEDs if they're off
   * @returns Promise that resolves when initialization is complete
   */
  public async connect(): Promise<void> {
    console.log(
      `WLEDDdp connection initializing to ${this._host}:${this._port}`,
    );
    await this.jsonClient.init();
    await this.jsonClient.turnOn();
    console.log(`WLEDDdp connected to ${this._host}:${this._port}`);
  }

  /**
   * Sends raw RGB byte data to the WLED device
   * @param data Uint8Array of RGB bytes (R,G,B,...) to send
   * @returns void
   */
  public send(data: Uint8Array): void {
    const packet = this.createPacket(data);
    this.sendPacket(packet);
  }

  /**
   * Sets the overall brightness of the WLED device
   * @param brightness Brightness value (0-255)
   * @returns Promise that resolves when brightness has been set
   */
  public async setBrightness(brightness: number): Promise<void> {
    if (brightness < 0 || brightness > 255) 
      throw new Error("Brightness must be between 0 and 255");
    
    await this.jsonClient.setBrightness(brightness);
  }

  /**
   * Creates an array of LED color values with the specified initial fill
   * @param initialFill Optional initial color for all LEDs, defaults to [0,0,0] (off)
   * @returns Array of LED color values
   */
  public getLeds(initialFill?: Led): readonly Led[] {
    const defaultColor: Led = [0, 0, 0];
    return new Array(this._ledCount).fill(initialFill ?? defaultColor) as Led[];
  }

  /**
   * Creates a DDP packet from a raw RGB byte array
   * @param rgbBytes Uint8Array of RGB bytes (R,G,B,...)
   * @returns Buffer containing the DDP packet
   * @private
   */
  private createPacket(rgbBytes: Uint8Array): Buffer {
    const header = Buffer.alloc(10); // DDP header is 10 bytes
    header[0] = this.VER1 | this.FLAG_PUSH; // version + PUSH flag
    header[1] = 0x00; // Reserved for future use, set to 0.
    header[2] = this.DATA_TYPE;
    header[3] = this.OUTPUT_ID;
    header.writeUInt32BE(0, 4); // Offset set to 0
    header.writeUInt16BE(rgbBytes.length, 8); // Data length

    const data = Buffer.from(rgbBytes);

    return Buffer.concat([header, data]);
  }

  /**
   * Sends a DDP packet to the WLED device
   * @param packet Buffer containing the DDP packet
   * @private
   */
  private sendPacket(packet: Buffer): void {
    this._socket.send(
      packet,
      0,
      packet.length,
      this._port,
      this._host,
      (error: Error | null, _bytes: number) => {
        if (error !== null) 
          console.error("Error sending packet:", error);
        
      },
    );
  }

  /**
   * Closes underlying resources.
   * If the LEDs were initially off and autoTurnOn was used, turns them off again.
   */
  public async close(): Promise<void> {
    this._socket.close();
    try {
      await this.jsonClient.turnOff();
      console.log(`WLEDDdp connection closed to ${this._host}:${this._port}`);
    } catch (error) {
      console.warn("Failed to turn off LEDs on close:", error);
    }
  }
}
