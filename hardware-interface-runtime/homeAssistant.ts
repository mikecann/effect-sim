import { reachOut } from "../shared/outsideWorld";
import type { PlugReading } from "./display/plug";

// The display's mains power is a smart plug in Home Assistant ("Xmas Lights
// Plug - Main"). With these set in .env.local, the remote's on/off switches
// that plug, and HWIR follows it when Home Assistant switches it (its sunset
// and 10pm automations). Without them, on/off only blacks the LEDs out.
const url = process.env.HA_URL;
const token = process.env.HA_TOKEN;
const entityId = process.env.HA_PLUG_ENTITY;

export const plugConfigured = Boolean(url && token && entityId);

/** Resolves to null when the outside world is blocked (dry runs). */
const call = (method: string, path: string, body?: unknown) =>
  reachOut(
    `calling Home Assistant ${method} ${path}`,
    () => send(method, path, body),
    Promise.resolve(null),
  );

const send = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok)
    throw new Error(`Home Assistant ${method} ${path}: ${res.status}`);
  return res.json();
};

/**
 * Whether the plug is on (null if Home Assistant doesn't know right now:
 * "unavailable", "unknown", or no answer), and when its state last changed.
 */
export const readPlug = async (): Promise<PlugReading> => {
  const state = (await call("GET", `/api/states/${entityId}`)) as {
    state: string;
    last_changed?: string;
  } | null;
  if (!state) return { on: null, changedAt: null };
  const on = state.state === "on" ? true : state.state === "off" ? false : null;
  const changedAt = state.last_changed ? Date.parse(state.last_changed) : NaN;
  return { on, changedAt: Number.isFinite(changedAt) ? changedAt : null };
};

/** Throws if Home Assistant refuses or doesn't answer (display/plug.ts retries). */
export const switchPlug = async (on: boolean) => {
  await call("POST", `/api/services/switch/turn_${on ? "on" : "off"}`, {
    entity_id: entityId,
  });
};
