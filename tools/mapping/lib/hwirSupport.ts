// Block fills light `ranges` patterns, which only an HWIR from block fills
// on renders; an older one lights every LED and still acks. Convex enforces
// it (mapping.show refuses, mapping.shown drops the ack); this is the early,
// friendlier check before a fill starts.

/** Whether HWIR's last heartbeat says it renders `ranges`. */
export const hwirSupportsRanges = (
  presence: { commit: string; patterns?: string[] } | null | undefined,
): { ok: true } | { ok: false; why: string } =>
  presence?.patterns?.includes("ranges")
    ? { ok: true }
    : {
        ok: false,
        why: presence
          ? `HWIR ${presence.commit.slice(0, 7)} doesn't render block patterns yet (it would light every LED). Wait for it to pick up main.`
          : "HWIR has never reported for this project.",
      };
