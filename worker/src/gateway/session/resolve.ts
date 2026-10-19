import { readCookie, STANDALONE_SESSION } from "@pawl/auth";
import type { Identity, SessionIdentity } from "@pawl/core";
import { INTERNAL_HOSTS } from "@pawl/topology";

import { keyringFor } from "./keys";
import { verifyToken, type TokenClaims } from "./token";

export const SESSION_COOKIE_NAME = "__Host-session";

export interface SessionEnv {
  ENVIRONMENT?: string;
  PUBLIC_ORIGIN?: string;
  PASS?: Fetcher;
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
}

export type SessionState =
  | { kind: "signed-in"; session: SessionIdentity }
  | { kind: "expired" }
  | { kind: "guest" };

function roleOf(value: string | null | undefined): Identity["role"] {
  return value === "ADMIN" ? "ADMIN" : "USER";
}

function statedSession(request: Request): SessionIdentity | null {
  const url = new URL(request.url);
  if (
    url.hostname !== INTERNAL_HOSTS.GATEWAY ||
    url.pathname !== "/api/estate"
  ) {
    return null;
  }
  const user = request.headers.get("x-pawl-user");
  if (!user) return null;
  return {
    identity: {
      id: user,
      email: "",
      username: null,
      role: roleOf(request.headers.get("x-pawl-role")),
    },
    sessionId: "stated",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

function sessionFrom(claims: TokenClaims): SessionIdentity {
  return {
    identity: {
      id: claims.sub,
      email: claims.email ?? "",
      username: claims.preferred_username ?? null,
      role: roleOf(claims.role),
    },
    sessionId: "pawl",
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  };
}

export async function sessionState(
  request: Request,
  env: SessionEnv,
): Promise<SessionState> {
  if (!env.PASS) return { kind: "signed-in", session: STANDALONE_SESSION };
  const stated = statedSession(request);
  if (stated) return { kind: "signed-in", session: stated };
  const token = readCookie(request, SESSION_COOKIE_NAME);
  let expired = false;
  if (token && env.OIDC_ISSUER && env.OIDC_CLIENT_ID) {
    const verified = await verifyToken(token, keyringFor(env.PASS), {
      issuer: env.OIDC_ISSUER,
      audience: env.OIDC_CLIENT_ID,
      now: Date.now(),
    });
    if (verified.kind === "valid") {
      return { kind: "signed-in", session: sessionFrom(verified.claims) };
    }
    expired = verified.kind === "expired";
  }
  return expired ? { kind: "expired" } : { kind: "guest" };
}

export function requireProviderInProduction(env: SessionEnv): void {
  if (env.ENVIRONMENT !== "production") return;
  const missing = [
    env.PASS ? null : "the PASS binding",
    env.OIDC_ISSUER ? null : "OIDC_ISSUER",
    env.OIDC_CLIENT_ID ? null : "OIDC_CLIENT_ID",
    env.OIDC_CLIENT_SECRET ? null : "OIDC_CLIENT_SECRET",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `The gateway is missing ${missing.join(", ")} in production, so it cannot tell who is signed in`,
    );
  }
}
