import { encodeBase64Url } from "@pawl/crypto";

import type { Env } from "../env";

export interface SigningKey {
  key: CryptoKey;
  kid: string;
}

export interface PublicJwk {
  kty: string;
  crv: string;
  x: string;
  y: string;
  alg: "ES256";
  use: "sig";
  kid: string;
}

export const SIGNING_ALGORITHM = {
  name: "ECDSA",
  namedCurve: "P-256",
} as const;

function configured(value: string | undefined): string {
  if (!value) throw new Error("OIDC_SIGNING_KEY is not configured");
  return value;
}

function importPrivate(material: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(material), (character) => character.charCodeAt(0)),
    SIGNING_ALGORITHM,
    true,
    ["sign"],
  );
}

async function publicJwk(key: CryptoKey): Promise<PublicJwk> {
  const { crv, kty, x, y } = (await crypto.subtle.exportKey(
    "jwk",
    key,
  )) as JsonWebKey;
  const thumbprint = JSON.stringify({ crv, kty, x, y });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(thumbprint),
  );
  return {
    kty: kty ?? "",
    crv: crv ?? "",
    x: x ?? "",
    y: y ?? "",
    alg: "ES256",
    use: "sig",
    kid: encodeBase64Url(new Uint8Array(digest)),
  };
}

export async function loadSigningKey(env: Env): Promise<SigningKey> {
  const key = await importPrivate(configured(env.OIDC_SIGNING_KEY));
  return { key, kid: (await publicJwk(key)).kid };
}

export async function publicJwks(env: Env): Promise<{ keys: PublicJwk[] }> {
  const current = await importPrivate(configured(env.OIDC_SIGNING_KEY));
  const keys = [await publicJwk(current)];
  if (env.OIDC_PREVIOUS_SIGNING_KEY) {
    keys.push(
      await publicJwk(await importPrivate(env.OIDC_PREVIOUS_SIGNING_KEY)),
    );
  }
  return { keys };
}
