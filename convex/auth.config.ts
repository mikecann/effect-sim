import type { AuthConfig } from "convex/server";

declare const process: { env: Record<string, string | undefined> };

// Set by Convex on every deployment.
const siteUrl = process.env.CONVEX_SITE_URL ?? "";

// Convex Auth v2's sessions (convex/editors.ts), signed by this deployment and
// checked against the keys its auth component serves.
export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "convex",
      issuer: siteUrl,
      jwks: `${siteUrl}/auth/.well-known/jwks.json`,
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig;
