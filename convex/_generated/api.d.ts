/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as display from "../display.js";
import type * as displayControl from "../displayControl.js";
import type * as editor from "../editor.js";
import type * as editorSync from "../editorSync.js";
import type * as editors from "../editors.js";
import type * as functions from "../functions.js";
import type * as hwir from "../hwir.js";
import type * as hwirPresence from "../hwirPresence.js";
import type * as machines from "../machines.js";
import type * as machinesViewer from "../machinesViewer.js";
import type * as mapping from "../mapping.js";
import type * as mappingSession from "../mappingSession.js";
import type * as migrations from "../migrations.js";
import type * as roles from "../roles.js";
import type * as switchState from "../switchState.js";
import type * as switches from "../switches.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  display: typeof display;
  displayControl: typeof displayControl;
  editor: typeof editor;
  editorSync: typeof editorSync;
  editors: typeof editors;
  functions: typeof functions;
  hwir: typeof hwir;
  hwirPresence: typeof hwirPresence;
  machines: typeof machines;
  machinesViewer: typeof machinesViewer;
  mapping: typeof mapping;
  mappingSession: typeof mappingSession;
  migrations: typeof migrations;
  roles: typeof roles;
  switchState: typeof switchState;
  switches: typeof switches;
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
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authGoogle: import("@convex-dev/auth/components/google/_generated/component.js").ComponentApi<"authGoogle">;
};
