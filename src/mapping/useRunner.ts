import { ConvexError } from "convex/values";
import { useState } from "react";

const messageOf = (error: unknown) =>
  error instanceof ConvexError &&
  typeof error.data === "object" &&
  error.data !== null &&
  "message" in error.data
    ? String(error.data.message)
    : error instanceof Error
      ? error.message
      : String(error);

/** Runs one action at a time, naming the one in flight so its button can spin. */
export const useRunner = () => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (name: string, action: () => Promise<unknown>) => {
    setBusy(name);
    setError(null);
    try {
      const result = await action();
      if (
        typeof result === "object" &&
        result !== null &&
        "status" in result &&
        result.status === "rejected" &&
        "reasons" in result &&
        Array.isArray(result.reasons)
      )
        setError(result.reasons.join(" "));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
};

export type Runner = ReturnType<typeof useRunner>;
