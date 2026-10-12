import { describe, expect, it } from "vitest";

import type { Env } from "../env";
import { loadSigningKey, publicJwks } from "./keys";

async function generated(): Promise<string> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return btoa(String.fromCharCode(...new Uint8Array(pkcs8 as ArrayBuffer)));
}

describe("publicJwks", () => {
  it("publishes the current key with a kid and no private material", async () => {
    const env = { OIDC_SIGNING_KEY: await generated() } as Env;
    const jwks = await publicJwks(env);
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({
      kty: "EC",
      crv: "P-256",
      alg: "ES256",
      use: "sig",
    });
    expect(jwks.keys[0]?.kid).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(jwks.keys[0]).not.toHaveProperty("d");
  });

  it("keeps the previous key so tokens signed with it still verify", async () => {
    const env = {
      OIDC_SIGNING_KEY: await generated(),
      OIDC_PREVIOUS_SIGNING_KEY: await generated(),
    } as Env;
    const jwks = await publicJwks(env);
    expect(jwks.keys).toHaveLength(2);
    expect(jwks.keys[0]?.kid).not.toBe(jwks.keys[1]?.kid);
  });

  it("names the signing key by the same kid it publishes", async () => {
    const env = { OIDC_SIGNING_KEY: await generated() } as Env;
    const [published] = (await publicJwks(env)).keys;
    expect((await loadSigningKey(env)).kid).toBe(published?.kid);
  });

  it("fails loudly when no signing key is configured", async () => {
    await expect(publicJwks({} as Env)).rejects.toThrow(/OIDC_SIGNING_KEY/);
    await expect(loadSigningKey({} as Env)).rejects.toThrow(/OIDC_SIGNING_KEY/);
  });
});
