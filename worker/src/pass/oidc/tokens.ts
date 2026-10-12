import { pairwiseSub, signClaims, verifiedClaims } from "@pawl/oidc";

import type { Env } from "../env";
import type { OidcClient } from "./clients";
import { loadSigningKey, publicJwks } from "./keys";

export const TOKEN_TTL_SECONDS = 600;

export interface AccessTokenClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  scope: string;
  client_id?: string;
  iat: number;
  exp: number;
  role?: "ADMIN" | "USER";
  email?: string;
  email_verified?: boolean;
  preferred_username?: string;
}

async function sign(
  env: Env,
  claims: Record<string, unknown>,
): Promise<string> {
  const { pkcs8 } = await loadSigningKey(env);
  const iat = Math.floor(Date.now() / 1000);
  return signClaims(pkcs8, {
    ...claims,
    iss: env.PUBLIC_ORIGIN,
    iat,
    exp: iat + TOKEN_TTL_SECONDS,
  });
}

export async function deriveSub(
  env: Env,
  client: OidcClient,
  userId: string,
): Promise<string> {
  if (client.firstParty) return userId;
  if (!env.OIDC_SUB_SECRET) {
    throw new Error("OIDC_SUB_SECRET is not configured");
  }
  return pairwiseSub(env.OIDC_SUB_SECRET, client.sector, userId);
}

export function mintAccessToken(
  env: Env,
  input: {
    audience: string | string[];
    sub: string;
    scopes: string[];
    clientId?: string;
    identity?: Record<string, unknown>;
  },
): Promise<string> {
  return sign(env, {
    ...input.identity,
    aud: input.audience,
    sub: input.sub,
    scope: input.scopes.join(" "),
    ...(input.clientId === undefined ? {} : { client_id: input.clientId }),
  });
}

export function mintIdToken(
  env: Env,
  input: {
    client: OidcClient;
    sub: string;
    nonce: string | null;
    claims: Record<string, unknown>;
  },
): Promise<string> {
  return sign(env, {
    ...input.claims,
    aud: input.client.id,
    sub: input.sub,
    ...(input.nonce === null ? {} : { nonce: input.nonce }),
  });
}

export async function verifyAccessToken(
  env: Env,
  token: string,
  audience: string,
  now: number = Date.now(),
): Promise<AccessTokenClaims | null> {
  try {
    const { keys } = await publicJwks(env);
    return verifiedClaims(
      token,
      keys,
      env.PUBLIC_ORIGIN,
      audience,
      now,
    ) as AccessTokenClaims | null;
  } catch {
    return null;
  }
}
