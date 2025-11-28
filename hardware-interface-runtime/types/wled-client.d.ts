declare module 'wled-client' {
  export interface WLEDClientOptions {
    host: string;
    port?: number;
    websocket?: boolean;
  }

  export interface WLEDState {
    on: boolean;
    [key: string]: unknown;
  }

  export interface WLEDInfo {
    [key: string]: unknown;
  }

  export class WLEDClient {
    constructor(options: WLEDClientOptions);

    state: WLEDState;
    info: WLEDInfo;

    init(): Promise<void>;
    turnOn(): Promise<void>;
    turnOff(): Promise<void>;
    setBrightness(brightness: number): Promise<void>;
  }
}
