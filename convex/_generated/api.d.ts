/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as display from "../display.js";
import type * as displayControl from "../displayControl.js";
import type * as functions from "../functions.js";
import type * as machines from "../machines.js";
import type * as machinesViewer from "../machinesViewer.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  display: typeof display;
  displayControl: typeof displayControl;
  functions: typeof functions;
  machines: typeof machines;
  machinesViewer: typeof machinesViewer;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  stateMachines: import("@convex-dev/state-machines/_generated/component.js").ComponentApi<"stateMachines">;
};
