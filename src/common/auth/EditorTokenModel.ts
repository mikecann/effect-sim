import { makeAutoObservable } from "mobx";

const storageKey = "effect-sim:editor-token";

/**
 * The editor's token (EDITOR_TOKEN on the Convex deployment, convex/roles.ts),
 * asked for once and kept in this browser's localStorage. Every mutation the
 * editor sends carries it.
 */
export class EditorTokenModel {
  token: string | null = readStoredToken();
  /** Why the token modal is open, or null when it isn't. */
  askReason: string | null = null;

  constructor() {
    makeAutoObservable(this);
    if (!this.token) this.ask("The editor needs its token to save changes.");
  }

  ask(reason: string) {
    this.askReason = reason;
  }

  set(token: string) {
    this.token = token;
    this.askReason = null;
    localStorage.setItem(storageKey, token);
  }

  /** The server refused the token: forget it and ask again. */
  refused() {
    this.token = null;
    localStorage.removeItem(storageKey);
    this.ask("The server didn't accept the editor token. Paste it again.");
  }
}

const readStoredToken = () => {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
};

/** Whether a Convex error is a token refusal (convex/roles.ts). */
export const isUnauthorized = (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  "data" in error &&
  (error as { data?: { code?: unknown } }).data?.code === "UNAUTHORIZED";
