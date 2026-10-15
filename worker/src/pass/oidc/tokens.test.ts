import { decodeBase64Url } from "@pawl/crypto";
import { verifiedClaims } from "@pawl/oidc";
import { beforeAll, describe, expect, it } from "vitest";

import type { Env } from "../env";
import type { OidcClient } from "./clients";
import { loadSigningKey, publicJwks } from "./keys";
import {
  deriveSub,
  mintAccessToken,
  mintCardToken,
  mintIdToken,
  verifyAccessToken,
} from "./tokens";

async function generated(): Promise<string> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return btoa(String.fromCharCode(...new Uint8Array(pkcs8 as ArrayBuffer)));
}

function part(token: string, index: number): Record<string, unknown> {
  return JSON.parse(
    new TextDecoder().decode(decodeBase64Url(token.split(".")[index] ?? "")),
  ) as Record<string, unknown>;
}

const headerOf = (token: string) => part(token, 0);
const payloadOf = (token: string) => part(token, 1);

const firstParty: OidcClient = {
  id: "notes",
  name: "Notes",
  redirectUris: ["https://des.product.test/callback"],
  allowedScopes: ["openid", "email", "profile"],
  confidential: true,
  firstParty: true,
  sector: "des.product.test",
};

const thirdParty: OidcClient = {
  ...firstParty,
  id: "docs-access",
  firstParty: false,
  sector: "cloudflareaccess.com",
};

let env: Env;

beforeAll(async () => {
  env = {
    PUBLIC_ORIGIN: "https://paw.product.test",
    OIDC_SIGNING_KEY: await generated(),
    OIDC_SUB_SECRET: "pairwise-secret",
  } as Env;
});

describe("deriveSub", () => {
  it("gives a first-party client the account id, so its own rows still match", async () => {
    expect(await deriveSub(env, firstParty, "user-1")).toBe("user-1");
  });

  it("gives a third-party client a value that is not the account id", async () => {
    expect(await deriveSub(env, thirdParty, "user-1")).not.toBe("user-1");
  });

  it("gives two third-party sectors different values for one account", async () => {
    const a = await deriveSub(env, { ...thirdParty, sector: "a.test" }, "u-1");
    const b = await deriveSub(env, { ...thirdParty, sector: "b.test" }, "u-1");
    expect(a).not.toBe(b);
  });

  it("is stable across calls for one sector", async () => {
    expect(await deriveSub(env, thirdParty, "user-1")).toBe(
      await deriveSub(env, thirdParty, "user-1"),
    );
  });

  it("refuses to invent a pairwise sub without its secret", async () => {
    await expect(
      deriveSub({ ...env, OIDC_SUB_SECRET: undefined }, thirdParty, "user-1"),
    ).rejects.toThrow(/OIDC_SUB_SECRET/);
  });
});

describe("mintAccessToken", () => {
  it("names the resource in aud, not the client", async () => {
    const token = await mintAccessToken(env, {
      audience: "https://des.product.test",
      sub: "user-1",
      scopes: ["openid"],
    });
    expect(payloadOf(token).aud).toBe("https://des.product.test");
  });

  it("names the client it was issued to, so userinfo can find the grant", async () => {
    const token = await mintAccessToken(env, {
      audience: ["notes", "https://paw.product.test"],
      sub: "user-1",
      scopes: ["openid"],
      clientId: "notes",
    });
    expect(payloadOf(token).client_id).toBe("notes");
  });

  it("expires within ten minutes", async () => {
    const token = await mintAccessToken(env, {
      audience: "a",
      sub: "u",
      scopes: [],
    });
    const { iat, exp } = payloadOf(token) as { iat: number; exp: number };
    expect(exp - iat).toBeGreaterThanOrEqual(300);
    expect(exp - iat).toBeLessThanOrEqual(600);
  });

  it("carries the kid of the signing key in its header", async () => {
    const token = await mintAccessToken(env, {
      audience: "a",
      sub: "u",
      scopes: [],
    });
    const { kid } = await loadSigningKey(env);
    expect(headerOf(token)).toMatchObject({ alg: "ES256", kid });
  });
});

describe("mintIdToken", () => {
  it("names the client in aud and echoes the nonce", async () => {
    const token = await mintIdToken(env, {
      client: firstParty,
      sub: "user-1",
      nonce: "n-0S6",
      claims: { email: "owner@product.test", email_verified: true },
    });
    expect(payloadOf(token)).toMatchObject({
      iss: "https://paw.product.test",
      aud: "notes",
      sub: "user-1",
      nonce: "n-0S6",
      email: "owner@product.test",
      email_verified: true,
    });
  });

  it("carries no nonce when none was asked for", async () => {
    const token = await mintIdToken(env, {
      client: firstParty,
      sub: "user-1",
      nonce: null,
      claims: {},
    });
    expect(payloadOf(token)).not.toHaveProperty("nonce");
  });
});

describe("verifyAccessToken", () => {
  const issuer = "https://paw.product.test";

  it("accepts a token minted for the audience asking", async () => {
    const token = await mintAccessToken(env, {
      audience: ["notes", issuer],
      sub: "user-1",
      scopes: ["openid"],
    });
    expect(await verifyAccessToken(env, token, issuer)).toMatchObject({
      sub: "user-1",
      scope: "openid",
    });
  });

  it("rejects a token minted for another audience", async () => {
    const token = await mintAccessToken(env, {
      audience: "https://somewhere.else.test",
      sub: "user-1",
      scopes: ["openid"],
    });
    expect(await verifyAccessToken(env, token, issuer)).toBeNull();
  });

  it("rejects a token whose payload was altered after signing", async () => {
    const token = await mintAccessToken(env, {
      audience: issuer,
      sub: "user-1",
      scopes: ["openid"],
    });
    const [header, , signature] = token.split(".");
    const forged = btoa(JSON.stringify({ ...payloadOf(token), sub: "admin" }))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/u, "");
    expect(
      await verifyAccessToken(env, `${header}.${forged}.${signature}`, issuer),
    ).toBeNull();
  });

  it("rejects a token signed by a key it does not publish", async () => {
    const stranger = { ...env, OIDC_SIGNING_KEY: await generated() } as Env;
    const token = await mintAccessToken(stranger, {
      audience: issuer,
      sub: "user-1",
      scopes: ["openid"],
    });
    expect(await verifyAccessToken(env, token, issuer)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await mintAccessToken(env, {
      audience: issuer,
      sub: "user-1",
      scopes: ["openid"],
    });
    const later = Date.now() + 601_000;
    expect(await verifyAccessToken(env, token, issuer, later)).toBeNull();
  });

  it("rejects something that is not a token at all", async () => {
    expect(await verifyAccessToken(env, "not.a.token", issuer)).toBeNull();
    expect(await verifyAccessToken(env, "", issuer)).toBeNull();
  });
});

describe("mintCardToken", () => {
  it("signs a one-minute token for one app and one subject, marked as a card request", async () => {
    const token = await mintCardToken(env, {
      clientId: "dns",
      sub: "pairwise-1",
      claims: { email: "budi@product.test", email_verified: true },
    });
    const payload = payloadOf(token);
    expect(payload).toMatchObject({
      iss: "https://paw.product.test",
      aud: "dns",
      sub: "pairwise-1",
      token_use: "pawl-card",
      email: "budi@product.test",
      email_verified: true,
    });
    expect(payload.nonce).toBeUndefined();
    expect(Number(payload.exp) - Number(payload.iat)).toBe(60);
    expect(headerOf(token)).toMatchObject({ alg: "ES256" });
    const { keys } = await publicJwks(env);
    expect(
      verifiedClaims(
        token,
        keys,
        "https://paw.product.test",
        "dns",
        Date.now(),
      ),
    ).not.toBeNull();
    expect(
      verifiedClaims(
        token,
        keys,
        "https://paw.product.test",
        "other",
        Date.now(),
      ),
    ).toBeNull();
  });

  it("never lets an app's claims replace who issued it, for whom, or when it ends", async () => {
    const token = await mintCardToken(env, {
      clientId: "dns",
      sub: "pairwise-1",
      claims: { iss: "https://evil.test", aud: "x", exp: 9e12, token_use: "x" },
    });
    expect(payloadOf(token)).toMatchObject({
      iss: "https://paw.product.test",
      aud: "dns",
      token_use: "pawl-card",
    });
    expect(Number(payloadOf(token).exp)).toBeLessThan(Date.now() / 1000 + 61);
  });
});
