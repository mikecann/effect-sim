import { action } from "mobx";

/**
 * Capitalizes the first letter of a string.
 */
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Fields that should not have setters generated (immutable after creation).
 */
const READONLY_FIELDS = ["_id", "_creationTime", "key", "projectId"] as const;
const READONLY_FIELDS_SET = new Set<string>(READONLY_FIELDS);

/**
 * Exposes all fields from `model.doc` as:
 * - Getters for reading (e.g., `model.name`)
 * - Setter functions for writing (e.g., `model.setName(value)`)
 *
 * Note: `_id`, `_creationTime`, `key` and `projectId` do not get setters as they
 * never change.
 *
 * IMPORTANT: Call this AFTER makeAutoObservable, not before.
 * MobX doesn't handle dynamically-added getters well if they exist before it runs.
 *
 * @example
 * export interface MyModel extends WithAutoSetters<Doc<"myTable">> {}
 *
 * export class MyModel {
 *   constructor(public doc: Doc<"myTable">) {
 *     makeAutoObservable(this);
 *     exposeDocFields(this);
 *   }
 * }
 */
export function exposeDocFields<T extends { doc: object }>(model: T): void {
  const doc = model.doc as Record<string, unknown>;
  for (const key of Object.keys(doc)) {
    // Add getter if not already defined
    if (!(key in model))
      Object.defineProperty(model, key, {
        get() {
          return (this as { doc: Record<string, unknown> }).doc[key];
        },
        enumerable: true,
        configurable: true,
      });

    // Skip setters for readonly fields
    if (READONLY_FIELDS_SET.has(key)) continue;

    // Add setter function (setXxx) wrapped in MobX action
    const setterName = `set${capitalize(key)}`;
    if (!(setterName in model))
      Object.defineProperty(model, setterName, {
        value: action(function (
          this: { doc: Record<string, unknown> },
          value: unknown,
        ) {
          this.doc[key] = value;
        }),
        enumerable: false,
        configurable: true,
        writable: true,
      });
  }
}

/**
 * Fields that are readonly and should not have setters.
 * Derived from READONLY_FIELDS constant.
 */
type ReadonlyFields = (typeof READONLY_FIELDS)[number];

/**
 * Generates setter function types for each property in T (excluding readonly fields).
 * e.g., { name: string } becomes { setName: (value: string) => void }
 * Note: All setters are always defined (not optional), even for optional properties.
 */
type SettersFor<T> = {
  [K in keyof T as K extends ReadonlyFields
    ? never
    : K extends string
      ? `set${Capitalize<K>}`
      : never]-?: (value: T[K]) => void;
};

/**
 * Combines an object type with auto-generated setter functions.
 * Use this for interface merging with model classes.
 *
 * @example
 * export interface PlaylistModel extends WithAutoSetters<Doc<"playlists">> {}
 * export interface StringNodeModel extends WithAutoSetters<NodeDocOfKind<"string">> {}
 */
export type WithAutoSetters<T extends object> = T & SettersFor<T>;
