import { customMutation } from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import type { MutationBuilder } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { machines } from "./machines";
import { currentEditor } from "./editors";
import { authAs, roleForToken, type Role } from "./roles";

// The mutation builders every public mutation uses (see convex/roles.ts for
// the tokens and the widen/switch rollout). They're the state machine
// catalog's builders, so the handlers can move machines, with the token
// checked first and the role on ctx.auth for the machines' callers.

// The catalog's builder is itself a custom builder, which customMutation's
// types don't take. At runtime it is a mutation builder, and its handlers get
// its guarded db; the cast only loses the guard's compile-time types (the
// guard still throws, and the machines lint rules still check).
const machineMutation = machines.mutation as unknown as MutationBuilder<
  DataModel,
  "public"
>;

/**
 * A mutation builder that lets in only these roles: by `token`, or, where the
 * editor is allowed, an editor signed in with Google (convex/editors.ts). A
 * token, when sent, is always checked, even from a signed-in editor.
 */
export const roleMutation = (...allowed: [Role, ...Role[]]) =>
  customMutation(machineMutation, {
    args: { token: v.optional(v.string()) },
    input: async (ctx, { token }) => {
      const signedIn =
        token === undefined &&
        allowed.includes("editor") &&
        (await currentEditor(ctx)) !== null;
      const role = signedIn ? "editor" : roleForToken(allowed, token);
      return { ctx: { role, auth: authAs(ctx.auth, role) }, args: {} };
    },
  });

/** The editor (the web app, src/). */
export const editorMutation = roleMutation("editor");
/** HWIR, the runtime that drives the lights. */
export const hwirMutation = roleMutation("hwir");
/** The phone remote (ios/). */
export const remoteMutation = roleMutation("remote");
