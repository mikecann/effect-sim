import { findStringEffect, findSwitchEffect } from "./registry";

// Checks an event's props against its effect's schema (each effect's file in
// shared/effects/string or shared/effects/switch has it, with bounds that keep
// an effect's loops and allocations small: a runaway count would freeze HWIR
// on the live display; production's values all fit them). Convex runs it in
// editor.sync, so a bad row never reaches the lights.

/**
 * Whether a value is plain JSON: finite numbers, strings, booleans, null, and
 * arrays and plain objects of those, not too deep. Convex's v.any() would
 * also take a BigInt or bytes, which props must never hold.
 */
export const isPlainJson = (value: unknown, depth = 0): boolean => {
  if (depth > 8) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 10_000;
  if (Array.isArray(value))
    return (
      value.length <= 10_000 && value.every((v) => isPlainJson(v, depth + 1))
    );
  if (typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(value as Record<string, unknown>).every((v) =>
    isPlainJson(v, depth + 1),
  );
};

export type EffectPropsResult =
  | { ok: true; props: Record<string, unknown> | undefined }
  | { ok: false; problem: string };

/**
 * An event's props checked against its effect, as they should be stored:
 * only the fields the effect takes (fields another effect left behind when
 * the event's effect was changed are dropped), each of the right type and in
 * bounds. Missing fields are fine: the effect's defaults fill them in.
 */
export const parseEffectProps = (
  kind: "string_effect" | "switch_effect",
  effectDefinitionId: string,
  props: unknown,
): EffectPropsResult => {
  // The registry looks ids up in a Map, so "toString" isn't an effect.
  const effect =
    kind === "string_effect"
      ? findStringEffect(effectDefinitionId)
      : findSwitchEffect(effectDefinitionId);
  if (!effect)
    return {
      ok: false,
      problem: `There's no ${kind.replace("_", " ")} called '${effectDefinitionId}'.`,
    };
  if (props === undefined || props === null)
    return { ok: true, props: undefined };
  if (!isPlainJson(props))
    return {
      ok: false,
      problem: `${effectDefinitionId}'s props aren't plain JSON.`,
    };
  const result = effect.props.partial().safeParse(props);
  if (result.success) return { ok: true, props: result.data };
  const issue = result.error.issues[0];
  return {
    ok: false,
    problem: `${effectDefinitionId}'s ${issue?.path.join(".") || "props"}: ${issue?.message ?? "invalid"}`,
  };
};

/** Why an event's props won't do for its effect (parseEffectProps), or null. */
export const findEffectPropsProblem = (
  kind: "string_effect" | "switch_effect",
  effectDefinitionId: string,
  props: unknown,
): string | null => {
  const result = parseEffectProps(kind, effectDefinitionId, props);
  return result.ok ? null : result.problem;
};
