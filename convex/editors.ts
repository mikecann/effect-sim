import { getAuthUserId, setupConvexAuth } from "@convex-dev/auth/server";
import {
  setupGoogle,
  vGoogleProfile,
} from "@convex-dev/auth/methods/google/server";
import { ConvexError, v } from "convex/values";
import type { Auth } from "convex/server";
import { components, internal } from "./_generated/api";
import type { DatabaseReader } from "./_generated/server";
import { internalMutation, query } from "./_generated/server";
import { tokensRequired } from "./roles";

// Signing in to the editor, with Google through Convex Auth v2. The only
// accounts are the editor's own people, the Google addresses in the
// EDITOR_EMAILS env var (comma separated). Google has to have verified the
// address, and anyone else is turned away before an account is made. A
// signed-in editor counts as the editor role (convex/auth.ts), so the web app
// needs no token. HWIR, the phone and the mapping tool keep their tokens.

declare const process: { env: Record<string, string | undefined> };

const auth = setupConvexAuth({
  component: components.auth,
  usersTable: "editors",
});
export const { signOut, refreshSession, isAuthenticated } = auth;

// Google's sign-in comes back to the editor. Local dev servers only where
// AUTH_ALLOW_LOCALHOST_REDIRECTS is "true", which production never sets.
const allowedRedirectOrigins = [
  "https://effect-sim.mikeysee.workers.dev",
  ...(process.env.AUTH_ALLOW_LOCALHOST_REDIRECTS === "true"
    ? ["http://localhost:5173", "http://127.0.0.1:5173"]
    : []),
];

export const { startSignInWithGoogle, completeSignInWithGoogle } = setupGoogle(
  auth,
  { component: components.authGoogle, allowedRedirectOrigins },
).attachUserCallbacks({
  createUser: internal.editors.createEditor,
  onSignIn: internal.editors.onEditorSignIn,
});

const vGoogle = v.object({
  name: v.literal("google"),
  accountId: v.string(),
  profile: vGoogleProfile,
});

const editorEmails = () =>
  (process.env.EDITOR_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

/** Whether Google vouches for this address and it's on EDITOR_EMAILS. */
const isEditorEmail = (
  email: string | undefined,
  emailVerified: boolean,
): email is string =>
  emailVerified && !!email && editorEmails().includes(email.toLowerCase());

const notAnEditor = () =>
  new ConvexError({
    code: "NOT_AN_EDITOR",
    message: "That Google account can't use the editor.",
  });

/** The first sign-in of an editor's Google account makes their row. Nobody else gets one. */
export const createEditor = internalMutation({
  args: { provider: vGoogle },
  returns: v.id("editors"),
  handler: async (ctx, { provider: { profile } }) => {
    const { email, emailVerified } = profile;
    if (!isEditorEmail(email, emailVerified)) throw notAnEditor();
    return await ctx.db.insert("editors", {
      email,
      name: profile.name,
      picture: profile.picture,
    });
  },
});

/**
 * Later sign-ins keep the email, name and photo up to date. Convex Auth finds
 * a returning account by Google's account id, not its email, so the address
 * saved here is the one the list is checked against.
 */
export const onEditorSignIn = internalMutation({
  args: { provider: vGoogle, userId: v.id("editors") },
  returns: v.null(),
  handler: async (ctx, { provider: { profile }, userId }) => {
    const { email, emailVerified } = profile;
    if (!isEditorEmail(email, emailVerified)) throw notAnEditor();
    await ctx.db.patch("editors", userId, {
      email,
      name: profile.name,
      picture: profile.picture,
    });
    return null;
  },
});

/**
 * The signed-in editor, or null. Checked against EDITOR_EMAILS on every call,
 * so taking an address off the list locks it out at once, even with a session
 * still open.
 */
export const currentEditor = async (ctx: {
  auth: Auth;
  db: DatabaseReader;
}) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const editorId = ctx.db.normalizeId("editors", userId);
  const editor =
    editorId === null ? null : await ctx.db.get("editors", editorId);
  return editor !== null && isEditorEmail(editor.email, true) ? editor : null;
};

/**
 * Who the editor is open to. `signInNeeded` is false where tokens aren't
 * required yet (a local backend), so the editor opens without signing in.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const editor = await currentEditor(ctx);
    return {
      editor: editor && { email: editor.email, name: editor.name ?? null },
      signInNeeded: tokensRequired(),
    };
  },
});
