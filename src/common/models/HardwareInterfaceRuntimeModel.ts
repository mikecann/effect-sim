import { makeAutoObservable } from "mobx";
import { AppModel } from "./AppModel";

const defaultWsUrl = (() => {
  const host =
    typeof window === "undefined" ? "localhost" : window.location.hostname;
  return `ws://${host}:8787`;
})();

const WS_URL = (import.meta.env.VITE_WS_URL as string) ?? defaultWsUrl;

export type SocketStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closing"
  | "closed";

export class HardwareInterfaceRuntimeModel {
  status: SocketStatus = "idle";
  socket: WebSocket | null = null;
  autoconnect = true;
  readonly wsUrl: string;
  lastError: string | null = null;

  constructor(app: AppModel, url?: string) {
    makeAutoObservable(this);
    this.autoconnect = app.persistedData.hardwareInterfaceRuntime?.autoconnect ?? true;
    this.wsUrl = url ?? WS_URL;
    this.connect();
  }

  setStatus(status: SocketStatus) {
    this.status = status;
  }

  connect() {
    const existing = this.socket;
    if (existing) {
      const isOpen = existing.readyState === WebSocket.OPEN;
      const isConnecting = existing.readyState === WebSocket.CONNECTING;
      if (isOpen || isConnecting) return;
    }

    try {
      this.setStatus("connecting");
      const ws = new WebSocket(this.wsUrl);
      ws.binaryType = "arraybuffer";
      this.socket = ws;

      ws.onopen = () => {
        this.setStatus("open");
        this.setLastError(null);
        console.log(`[WS] Connected to ${this.wsUrl}`);
      };

      ws.onclose = (ev: CloseEvent) => {
        this.setStatus("closed");
        this.setLastError(`Closed: code=${ev.code} reason='${ev.reason}'`);
        // No retry logic here
      };

      ws.onerror = (ev: Event) => {
        const errorMessage =
          ev instanceof ErrorEvent ? ev.message : "unknown error";
        this.setLastError(`Error: ${String(errorMessage)}`);
        // No retry logic here
      };
    } catch (e) {
      this.setLastError(`Connect threw: ${(e as Error).message}`);
      this.setStatus("closed");
    }
  }

  setLastError(error: string | null) {
    this.lastError = error;
  }

  setAutoconnect(value: boolean) {
    this.autoconnect = value;
    // Side effects handled by HardwareInterfaceRuntimeConnector
  }

  disconnect() {
    const ws = this.socket;
    if (!ws) {
      this.setStatus("closed");
      return;
    }

    if (
      ws.readyState === WebSocket.CLOSING ||
      ws.readyState === WebSocket.CLOSED
    ) {
      this.setStatus("closed");
      return;
    }

    this.setStatus("closing");
    console.log("[WS] Disconnect requested");
    ws.close();
  }

  sendFrame(id: string, rgb: Uint8Array): void {
    const ws = this.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const idBytes = new TextEncoder().encode(id);
    const buf = new Uint8Array(2 + idBytes.length + rgb.length);
    buf[0] = 0x01; // opcode RGB
    buf[1] = idBytes.length;
    buf.set(idBytes, 2);
    buf.set(rgb, 2 + idBytes.length);
    ws.send(buf);
  }
}
