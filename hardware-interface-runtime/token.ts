/**
 * HWIR's token (HWIR_TOKEN, the same value as on the Convex deployment, see
 * convex/roles.ts). Bun reads it from .env.local. Every mutation HWIR sends
 * carries it; without one, they work only until the deployment sets
 * REQUIRE_TOKENS.
 */
export const hwirToken: string | undefined = process.env.HWIR_TOKEN || undefined;
