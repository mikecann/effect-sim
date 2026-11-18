import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { defineEffect } from "./defineEffect";
import { inspectableProps } from "./inspectableProps";

const example = defineEffect({
  id: "example",
  name: "Example",
  icon: "🧪",
  props: z.object({
    color: inspectableProps.color,
    speed: inspectableProps.bounded(0, 10),
  }),
  defaults: { color: [1, 2, 3], speed: 1 },
  render: function Example({ props }) {
    // The render's props are typed from the schema, with no casts.
    expectTypeOf(props).toEqualTypeOf<{
      color: [number, number, number];
      speed: number;
    }>();
    // @ts-expect-error: there's no such prop.
    void props.missing;
    return null;
  },
});

defineEffect({
  id: "wrongDefaults",
  name: "Wrong",
  icon: "x",
  props: z.object({ speed: inspectableProps.number }),
  // @ts-expect-error: defaults must match the schema.
  defaults: { speed: "fast" },
  render: () => null,
});

describe("defineEffect", () => {
  it("keeps the id as a literal type", () => {
    expectTypeOf(example.id).toEqualTypeOf<"example">();
    expect(example.kind).toBe("string_effect");
  });

  it("fills in defaults and keeps the fields that fit", () => {
    expectTypeOf(example.resolveProps).returns.toEqualTypeOf<{
      color: [number, number, number];
      speed: number;
    }>();
    expect(example.resolveProps(undefined)).toEqual({
      color: [1, 2, 3],
      speed: 1,
    });
    expect(example.resolveProps({ speed: 4 })).toEqual({
      color: [1, 2, 3],
      speed: 4,
    });
  });

  it("drops fields that don't fit, and ones from another effect", () => {
    expect(
      example.resolveProps({
        speed: 99,
        color: [255, 0, 0],
        fadeRatio: 0.5,
      }),
    ).toEqual({ color: [255, 0, 0], speed: 1 });
    expect(example.resolveProps({ color: "red", toString: 1 })).toEqual({
      color: [1, 2, 3],
      speed: 1,
    });
  });
});
