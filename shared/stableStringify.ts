/**
 * JSON with object keys sorted and undefined fields left out, so two docs
 * compare equal whatever order their fields came in. The editor and
 * editor.sync both use it to tell whether a row changed.
 */
export const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, inner]) => inner !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  );
