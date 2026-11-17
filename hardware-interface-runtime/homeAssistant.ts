import { logger } from "./utils/logger";

// The display's mains power is a smart plug in Home Assistant ("Xmas Lights
// Plug - Main"). With these set in .env.local, the remote's on/off switches
// that plug, and HWIR follows it when Home Assistant switches it (its sunset
// and 10pm automations). Without them, on/off only blacks the LEDs out.
const url = process.env.HA_URL;
const token = process.env.HA_TOKEN;
const entityId = process.env.HA_PLUG_ENTITY;

export const plugConfigured = Boolean(url && token && entityId);

const call = async (method: string, path: string, body?: unknown) => {
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

/** Whether the plug is on, or null if Home Assistant doesn't know right now. */
export const readPlug = async (): Promise<boolean | null> => {
  const state = (await call("GET", `/api/states/${entityId}`)) as {
    state: string;
  };
  if (state.state === "on") return true;
  if (state.state === "off") return false;
  return null; // "unavailable" or "unknown"
};

export const switchPlug = async (on: boolean) => {
  logger.info(`Switching the lights' plug ${on ? "on" : "off"}`);
  await call("POST", `/api/services/switch/turn_${on ? "on" : "off"}`, {
    entity_id: entityId,
  });
};
