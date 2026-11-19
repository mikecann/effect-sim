import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@convex-dev/auth/convex.config.js";
import authGoogle from "@convex-dev/auth/components/google/convex.config.js";
import stateMachines from "@convex-dev/state-machines/convex.config.js";

const app = defineApp({
  env: {
    // Convex Auth's signing keys (tools/setAuthKeys.ts makes them).
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
    // A Google OAuth client of the "Web application" type, for the editor's sign-in.
    AUTH_GOOGLE_CLIENT_ID: v.string(),
    AUTH_GOOGLE_CLIENT_SECRET: v.string(),
  },
});

// State machines (convex/machines.ts): each machine's history.
app.use(stateMachines);

// Convex Auth v2, for signing in to the editor (convex/editors.ts). HWIR, the
// phone and the mapping tool use role tokens instead (convex/roles.ts).
app.use(auth, {
  httpPrefix: "/auth",
  env: {
    AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
    AUTH_JWKS: app.env.AUTH_JWKS,
  },
});
// Google sends people back to <deployment>.convex.site/oauth/google/callback,
// the redirect URI registered on the OAuth client.
app.use(authGoogle, {
  httpPrefix: "/oauth/google",
  env: {
    CLIENT_ID: app.env.AUTH_GOOGLE_CLIENT_ID,
    CLIENT_SECRET: app.env.AUTH_GOOGLE_CLIENT_SECRET,
  },
});

export default app;
