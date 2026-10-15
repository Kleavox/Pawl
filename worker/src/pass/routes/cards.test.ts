import { decodeBase64Url } from "@pawl/crypto";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";

import type { Env } from "../env";
import {
  migratedDb,
  seedClient,
  seedUser,
  type TestDb,
} from "../oidc/db.testkit";
import { recordGrant, revokeGrantFor } from "../oidc/grants";
import { registerOutsideApp } from "../oidc/outside";
import { deriveSub } from "../oidc/tokens";
import { findClient } from "../oidc/clients";
import { registerInternalRoutes } from "./internal";
import { registerOidcRoutes } from "./oidc";
import type { AppEnv } from "./shared";

const ISSUER = "https://paw.product.test";

let db: TestDb;
let env: Env;
let app: Hono<AppEnv>;
let secret: string;

async function signingKey(): Promise<string> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return btoa(String.fromCharCode(...new Uint8Array(pkcs8 as ArrayBuffer)));
}

function payloadOf(token: string): Record<string, unknown> {
  return JSON.parse(
    new TextDecoder().decode(decodeBase64Url(token.split(".")[1] ?? "")),
  ) as Record<string, unknown>;
}

async function subjectOf(userId: string, clientId = "dns"): Promise<string> {
  const client = await findClient(env, clientId);
  if (!client) throw new Error("no client");
  return deriveSub(env, client, userId);
}

beforeEach(async () => {
  db = migratedDb();
  seedUser(db, { id: "u1", email: "budi@product.test", username: "budi" });
  seedUser(db, { id: "u2", email: "sari@product.test", username: "sari" });
  seedUser(db, { id: "u3", email: "gone@product.test", username: "gone" });
  db.sqlite
    .prepare("UPDATE users SET disabled_at = '2026-10-15' WHERE id = 'u3'")
    .run();
  env = {
    ENVIRONMENT: "production",
    PUBLIC_ORIGIN: ISSUER,
    ROOT_DOMAIN: "product.test",
    DB: db.DB,
    OIDC_SIGNING_KEY: await signingKey(),
    OIDC_SUB_SECRET: "pairwise-secret",
  } as unknown as Env;
  const dns = await registerOutsideApp(
    env,
    {
      title: "DNS",
      label: "dns",
      address: "https://enroll.elsewhere.test",
      returnTo: null,
      access: "visitor",
      card: true,
    },
    "u1",
  );
  if (dns.kind !== "created") throw new Error(dns.kind);
  secret = dns.secret;
  await registerOutsideApp(
    env,
    {
      title: "Wiki",
      label: "wiki",
      address: "https://wiki.elsewhere.test",
      returnTo: null,
      access: "public",
      card: false,
    },
    "u1",
  );
  app = new Hono<AppEnv>();
  registerInternalRoutes(app);
  registerOidcRoutes(app);
});

function cardToken(query: string, host = "pass.internal") {
  return app.request(`http://${host}/internal/card-token?${query}`, {}, env);
}

describe("the outside apps the gateway lists", () => {
  it("answers only on the internal host", async () => {
    const inside = await app.request(
      "http://pass.internal/internal/outside-apps",
      {},
      env,
    );
    expect(await inside.json()).toEqual({
      apps: [
        expect.objectContaining({ key: "dns", card: true, access: "visitor" }),
        expect.objectContaining({ key: "wiki", card: false }),
      ],
    });
    const outside = await app.request(
      `${ISSUER}/internal/outside-apps`,
      {},
      env,
    );
    expect(outside.status).toBe(404);
  });
});

describe("a card token for one person and one app", () => {
  it("asks for consent while the person has not connected the app", async () => {
    const response = await cardToken("key=dns&user=u1");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "CONSENT_REQUIRED",
      clientId: "dns",
    });
  });

  it("signs the token with the grant's subject and only what the grant allows", async () => {
    const sub = await subjectOf("u1");
    await recordGrant(env, "u1", "dns", sub, ["openid", "email"]);
    const response = await cardToken("key=dns&user=u1");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      token: string;
      origin: string;
      clientId: string;
    };
    expect(body.origin).toBe("https://enroll.elsewhere.test");
    expect(payloadOf(body.token)).toMatchObject({
      sub,
      aud: "dns",
      token_use: "pawl-card",
      email: "budi@product.test",
    });
    expect(payloadOf(body.token).preferred_username).toBeUndefined();
    expect(sub).not.toBe("u1");
  });

  it("stops once the person disconnects the app", async () => {
    await recordGrant(env, "u1", "dns", await subjectOf("u1"), ["openid"]);
    await revokeGrantFor(env, "u1", "dns");
    expect((await cardToken("key=dns&user=u1")).status).toBe(409);
  });

  it("gives nothing for an app without a card, an unknown app, a disabled account or a public host", async () => {
    await recordGrant(env, "u3", "dns", await subjectOf("u3"), ["openid"]);
    expect((await cardToken("key=wiki&user=u1")).status).toBe(404);
    expect((await cardToken("key=nope&user=u1")).status).toBe(404);
    expect((await cardToken("key=dns&user=u3")).status).toBe(403);
    expect((await cardToken("key=dns", "pass.internal")).status).toBe(400);
    expect(
      (
        await app.request(
          `${ISSUER}/internal/card-token?key=dns&user=u1`,
          {},
          env,
        )
      ).status,
    ).toBe(404);
  });
});

function subjects(body: unknown, auth: string | null) {
  return app.request(
    `${ISSUER}/oauth/subjects`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

const basic = (id: string, password: string) =>
  `Basic ${btoa(`${encodeURIComponent(id)}:${encodeURIComponent(password)}`)}`;

describe("which subjects are still connected", () => {
  it("tells an app which of its subjects still have a live grant, and nothing more", async () => {
    const live = await subjectOf("u1");
    const revoked = await subjectOf("u2");
    const disabled = await subjectOf("u3");
    await recordGrant(env, "u1", "dns", live, ["openid"]);
    await recordGrant(env, "u2", "dns", revoked, ["openid"]);
    await revokeGrantFor(env, "u2", "dns");
    await recordGrant(env, "u3", "dns", disabled, ["openid"]);
    const response = await subjects(
      { subjects: [live, revoked, disabled, "made-up"] },
      basic("dns", secret),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ live: [live] });
  });

  it("answers the same for a long list asked in one go", async () => {
    const live = await subjectOf("u1");
    await recordGrant(env, "u1", "dns", live, ["openid"]);
    const many = [
      ...Array.from({ length: 300 }, (_, index) => `x${index}`),
      live,
    ];
    const response = await subjects({ subjects: many }, basic("dns", secret));
    expect(await response.json()).toEqual({ live: [live] });
  });

  it("refuses an app that cannot prove it is the app, and a public client", async () => {
    expect((await subjects({ subjects: [] }, null)).status).toBe(401);
    expect(
      (await subjects({ subjects: [] }, basic("dns", "wrong"))).status,
    ).toBe(401);
    seedClient(db, {
      id: "spa",
      redirectUris: ["https://spa.elsewhere.test/cb"],
      firstParty: false,
      confidential: false,
    });
    expect((await subjects({ subjects: [] }, basic("spa", ""))).status).toBe(
      401,
    );
  });

  it("refuses a body that is not a list of at most a thousand subjects", async () => {
    for (const body of [
      {},
      { subjects: "x" },
      { subjects: [1] },
      { subjects: Array.from({ length: 1001 }, (_, index) => `s${index}`) },
    ]) {
      expect(
        (await subjects(body, basic("dns", secret))).status,
        JSON.stringify(body).slice(0, 40),
      ).toBe(400);
    }
  });

  it("is named in discovery", async () => {
    const response = await app.request(
      `${ISSUER}/.well-known/openid-configuration`,
      {},
      env,
    );
    expect(await response.json()).toMatchObject({
      pawl_subjects_endpoint: `${ISSUER}/oauth/subjects`,
    });
  });
});
