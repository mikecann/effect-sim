import { describe, expect, it } from "vitest";
import { findEffectPropsProblem } from "../../../shared/effects/props";
import { stringEffectDefinitionsArray } from "./stringEffectDefinitions";
import { switchEffectDefinitionsArray } from "./switchEffectDefinitions";

describe("effect props", () => {
  it("every effect's defaults pass its own schema", () => {
    for (const def of stringEffectDefinitionsArray)
      expect(
        findEffectPropsProblem("string_effect", def.id, def.defaultProps),
        def.id,
      ).toBeNull();
    for (const def of switchEffectDefinitionsArray)
      expect(
        findEffectPropsProblem("switch_effect", def.id, def.defaultProps),
        def.id,
      ).toBeNull();
  });

  it("refuses counts and sizes that would make an effect's loops run away", () => {
    expect(
      findEffectPropsProblem("string_effect", "fireflies", {
        numFireflies: 1e9,
      }),
    ).toMatch(/numFireflies/);
    expect(
      findEffectPropsProblem("string_effect", "sparkle", {
        sparklesPerFrame: 1e7,
      }),
    ).toMatch(/sparklesPerFrame/);
    expect(
      findEffectPropsProblem("string_effect", "bouncingBalls", {
        numBalls: 1e6,
      }),
    ).toMatch(/numBalls/);
    expect(
      findEffectPropsProblem("string_effect", "comet", { size: Infinity }),
    ).toMatch(/size/);
    expect(
      findEffectPropsProblem("string_effect", "setColor", {
        color: [0, 0, 999],
      }),
    ).toMatch(/color/);
    // Production's largest values still pass.
    expect(
      findEffectPropsProblem("string_effect", "fireflies", {
        numFireflies: 105,
      }),
    ).toBeNull();
    expect(
      findEffectPropsProblem("string_effect", "sparkle", {
        sparklesPerFrame: 301,
      }),
    ).toBeNull();
  });

  it("refuses inherited names instead of throwing", () => {
    for (const id of ["toString", "constructor", "__proto__", "hasOwnProperty"])
      expect(findEffectPropsProblem("string_effect", id, {})).toBe(
        `There's no string effect called '${id}'.`,
      );
  });
});
