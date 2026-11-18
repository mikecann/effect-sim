import { ConvexError } from "convex/values";
import type { Auth, UserIdentity } from "convex/server";

// Who may change what. effect-sim has no sign-in: each kind of client has a
// token, set as a Convex environment variable and given to that client
// (docs/rebuild-plan.md, "Auth"). Every mutation takes `token` and is built
// with one of the builders in convex/auth.ts, which check it before the handler runs.
// Queries stay public: nothing in the data is secret.
//
// Rollout is widen then switch. Until REQUIRE_TOKENS is "true", a call with no
// token is let through (and logged), so clients from before tokens keep
// working while they update. A wrong token is always refused.

export type Role = "editor" | "hwir" | "remote";

// Convex functions get their environment variables on process.env.
declare const process: { env: Record<string, string | undefined> };

const tokenEnvVars = {
  editor: "EDITOR_TOKEN",
  hwir: "HWIR_TOKEN",
  remote: "REMOTE_TOKEN",
} as const satisfies Record<Role, string>;

const issuer = "effect-sim-token";

/** Compares without stopping at the first difference, so timing says nothing about the token. */
const sameToken = (a: string, b: string) => {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
};

export const tokensRequired = () => process.env.REQUIRE_TOKENS === "true";

/**
 * The role a call's token is for, from the roles a function allows. Throws
 * when the token is wrong, or missing once tokens are required.
 */
export const roleForToken = (
  allowed: readonly [Role, ...Role[]],
  token: string | undefined,
): Role => {
  if (token === undefined) {
    if (tokensRequired())
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: `This needs the ${allowed.join(" or ")} token.`,
      });
    console.warn(
      `A ${allowed.join("/")} call came without a token. Accepted until REQUIRE_TOKENS is "true".`,
    );
    return allowed[0];
  }
  for (const role of allowed) {
    const expected = process.env[tokenEnvVars[role]];
    if (expected && sameToken(token, expected)) return role;
  }
  throw new ConvexError({
    code: "UNAUTHORIZED",
    message: `That isn't the ${allowed.join(" or ")} token.`,
  });
};

/**
 * ctx.auth, but with the role as the caller's identity. The state machines'
 * `callers` checks only get `{ db, auth }`, so this is how they learn who's
 * asking.
 */
export const authAs = <A extends Auth>(auth: A, role: Role): A => {
  const identity: UserIdentity = {
    subject: role,
    issuer,
    tokenIdentifier: `${issuer}|${role}`,
  };
  return new Proxy(auth, {
    get(target, prop) {
      if (prop === "getUserIdentity") return async () => identity;
      const value: unknown = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
};

/** Whether the call was checked as one of `roles` (for machines' callers). */
export const isRole = async (ctx: { auth: Auth }, ...roles: Role[]) => {
  const identity = await ctx.auth.getUserIdentity();
  return (
    identity?.issuer === issuer && roles.includes(identity.subject as Role)
  );
};
