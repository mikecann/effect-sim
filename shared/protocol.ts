export type TargetInfo = { id: string; ledCount: number };

export type ServerMessage =
  | { type: "hello"; port: number }
  | { type: "ok"; action: string; requestId?: string }
  | { type: "error"; message: string; requestId?: string };
