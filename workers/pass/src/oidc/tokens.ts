import { decodeBase64Url, encodeBase64Url } from "@pawl/crypto";

import type { Env } from "../env";
import type { OidcClient } from "./clients";
import { loadSigningKey, publicJwks, SIGNING_ALGORITHM } from "./keys";

export const TOKEN_TTL_SECONDS = 600;

export interface AccessTokenClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  scope: string;
  client_id?: string;
  iat: number;
  exp: number;
}

const SIGNATURE = { name: "ECDSA", hash: "SHA-256" } as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeJson(value: unknown): string {
  return encodeBase64Url(encoder.encode(JSON.stringify(value)));
}

function decodeJson(segment: string): unknown {
  return JSON.parse(decoder.decode(decodeBase64Url(segment)));
}

async function sign(
  env: Env,
  claims: Record<string, unknown>,
): Promise<string> {
  const { key, kid } = await loadSigningKey(env);
  const iat = Math.floor(Date.now() / 1000);
  const input = `${encodeJson({ alg: "ES256", typ: "JWT", kid })}.${encodeJson({
    ...claims,
    iss: env.PUBLIC_ORIGIN,
    iat,
    exp: iat + TOKEN_TTL_SECONDS,
  })}`;
  const signature = await crypto.subtle.sign(
    SIGNATURE,
    key,
    encoder.encode(input),
  );
  return `${input}.${encodeBase64Url(new Uint8Array(signature))}`;
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
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.OIDC_SUB_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${client.sector} ${userId}`),
  );
  return encodeBase64Url(new Uint8Array(mac));
}

export function mintAccessToken(
  env: Env,
  input: {
    audience: string | string[];
    sub: string;
    scopes: string[];
    clientId?: string;
  },
): Promise<string> {
  return sign(env, {
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
  const [header, payload, signature, extra] = token.split(".");
  if (!header || !payload || !signature || extra !== undefined) return null;
  try {
    const { alg, kid } = decodeJson(header) as { alg?: string; kid?: string };
    if (alg !== "ES256") return null;
    const jwk = (await publicJwks(env)).keys.find((key) => key.kid === kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      SIGNING_ALGORITHM,
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      SIGNATURE,
      key,
      decodeBase64Url(signature),
      encoder.encode(`${header}.${payload}`),
    );
    if (!valid) return null;
    const claims = decodeJson(payload) as AccessTokenClaims;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== env.PUBLIC_ORIGIN) return null;
    if (!audiences.includes(audience)) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
