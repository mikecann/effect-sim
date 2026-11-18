import type { SendOutcome } from "../strings/StringLink";

/** Frames a seq may be retried for a string whose send failed, before acking without it. */
export const MAX_ACK_ATTEMPTS = 10;

export type Ack = { seq: number; missed: string[] };

/**
 * Decides when a mapping pattern has gone out, so HWIR can ack its seq
 * (mapping.shown). A seq is acked after the first frame with it that every
 * live string took. Strings that aren't live never block it, and a live
 * string whose sends keep failing stops blocking it after MAX_ACK_ATTEMPTS
 * frames. Either way they're listed in `missed`.
 */
export class MappingAcker {
  private acked = -1;
  private current: { seq: number; attempts: number } | null = null;

  /** The server already has this seq (HWIR restarted mid-session). */
  alreadyShown(seq: number) {
    this.acked = Math.max(this.acked, seq);
  }

  /** The ack for this seq didn't reach Convex: let it be sent again. */
  forget(seq: number) {
    if (this.acked === seq) this.acked = seq - 1;
  }

  /** One frame of `seq` went out with these results. Returns the ack to send, if it's time. */
  frameSent(
    seq: number,
    results: { key: string; outcome: SendOutcome }[],
  ): Ack | null {
    if (seq <= this.acked) return null;
    if (this.current && seq < this.current.seq) return null; // a stale frame
    if (this.current?.seq !== seq) this.current = { seq, attempts: 0 };
    this.current.attempts++;
    const retry = results.some(
      (r) => r.outcome === "failed" || r.outcome === "busy",
    );
    if (retry && this.current.attempts < MAX_ACK_ATTEMPTS) return null;
    this.acked = seq;
    return {
      seq,
      missed: results.filter((r) => r.outcome !== "sent").map((r) => r.key),
    };
  }
}
