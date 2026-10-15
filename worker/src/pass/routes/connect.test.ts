import { SESSION_COOKIE } from "@pawl/auth";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";

import type { Env } from "../env";
import { createSession } from "../lib/session";
import { findClient } from "../oidc/clients";
import {
  migratedDb,
  seedClient,
  seedUser,
  type TestDb,
} from "../oidc/db.testkit";
import { findGrant, recordGrant } from "../oidc/grants";
import { registerOutsideApp } from "../oidc/outside";
import { deriveSub } from "../oidc/tokens";
import { registerOidcRoutes } from "./oidc";
import type { AppEnv } from "./shared";

const ISSUER = "https://paw.product.test";
const CABINET = "https://product.test/?bay=3";

let db: TestDb;
let env: Env;
let app: Hono<AppEnv>;

function kv() {
  const store = new Map<string, string>();
  return {
    get: async (key: string, type?: string) => {
      const value = store.get(key) ?? null;
      return value !== null && type === "json" ? JSON.parse(value) : value;
    },
    put: async (key: string, value: string) => void store.set(key, value),
    delete: async (key: string) => void store.delete(key),
    list: async ({ prefix }: { prefix: string }) => ({
      keys: [...store.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name, metadata: {} })),
    }),
  };
}

async function signingKey(): Promise<string> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return btoa(String.fromCharCode(...new Uint8Array(pkcs8 as ArrayBuffer)));
}

async function cookie(): Promise<string> {
  const { token } = await createSession(
    env,
    { id: "u1", email: "budi@product.test", username: "budi", role: "USER" },
    1,
  );
  return `${SESSION_COOKIE}=${token}`;
}

function connectUrl(clientId = "dns", returnTo = CABINET): string {
  return `${ISSUER}/oauth/connect?client_id=${clientId}&returnTo=${encodeURIComponent(returnTo)}`;
}

function decide(
  decision: "allow" | "deny",
  headers: Record<string, string>,
  fields: Record<string, string> = { client_id: "dns", returnTo: CABINET },
) {
  return app.request(
    `${ISSUER}/oauth/connect`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...headers,
      },
      body: new URLSearchParams({ ...fields, decision }).toString(),
      redirect: "manual",
    },
    env,
  );
}

beforeEach(async () => {
  db = migratedDb();
  seedUser(db, { id: "u1", email: "budi@product.test", username: "budi" });
  env = {
    ENVIRONMENT: "production",
    PUBLIC_ORIGIN: ISSUER,
    ROOT_DOMAIN: "product.test",
    DB: db.DB,
    SESSIONS: kv(),
    OIDC_SIGNING_KEY: await signingKey(),
    OIDC_SUB_SECRET: "pairwise-secret",
  } as unknown as Env;
  await registerOutsideApp(
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
  seedClient(db, {
    id: "docs",
    redirectUris: ["https://docs.elsewhere.test/cb"],
    firstParty: false,
  });
  app = new Hono<AppEnv>();
  registerOidcRoutes(app);
});

describe("connecting an outside app from the cabinet", () => {
  it("sends a signed-out person to sign in and back to the same question", async () => {
    const response = await app.request(
      connectUrl(),
      { redirect: "manual" },
      env,
    );
    expect(response.status).toBe(302);
    const target = new URL(response.headers.get("location") ?? "");
    expect(target.origin).toBe(ISSUER);
    expect(target.searchParams.get("returnTo")).toBe(connectUrl());
  });

  it("asks once, on Pawl's own consent page, posting back to connect", async () => {
    const response = await app.request(
      connectUrl(),
      { headers: { cookie: await cookie() } },
      env,
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('action="/oauth/connect"');
    expect(html).toContain('name="client_id" value="dns"');
    expect(html).toContain(
      `name="returnTo" value="${CABINET.replace("&", "&amp;")}"`,
    );
    expect(html).toContain("DNS");
    expect(html).toContain("Your verified email address");
    expect(html).not.toContain('name="request"');
  });

  it("records the grant with the app's own subject on Allow and goes back to the cabinet", async () => {
    const response = await decide("allow", {
      cookie: await cookie(),
      origin: ISSUER,
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(CABINET);
    const grant = await findGrant(env, "u1", "dns");
    const client = await findClient(env, "dns");
    expect(grant?.subject).toBe(await deriveSub(env, client!, "u1"));
    expect(grant?.scopes).toEqual(["openid", "email", "profile"]);
  });

  it("goes back without a grant on Deny", async () => {
    const response = await decide("deny", {
      cookie: await cookie(),
      origin: ISSUER,
    });
    expect(response.headers.get("location")).toBe(CABINET);
    expect(await findGrant(env, "u1", "dns")).toBeNull();
  });

  it("goes straight back once the app is connected", async () => {
    const client = await findClient(env, "dns");
    await recordGrant(env, "u1", "dns", await deriveSub(env, client!, "u1"), [
      "openid",
      "email",
      "profile",
    ]);
    const response = await app.request(
      connectUrl(),
      { headers: { cookie: await cookie() }, redirect: "manual" },
      env,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(CABINET);
  });

  it("refuses an app that is not an outside app, a return address off the cabinet, and a foreign form", async () => {
    const signedIn = { headers: { cookie: await cookie() } };
    expect((await app.request(connectUrl("docs"), signedIn, env)).status).toBe(
      400,
    );
    expect((await app.request(connectUrl("nope"), signedIn, env)).status).toBe(
      400,
    );
    for (const elsewhere of [
      "https://evil.test/",
      "https://enroll.elsewhere.test/",
      "javascript:alert(1)",
      "//evil.test/",
    ]) {
      expect(
        (await app.request(connectUrl("dns", elsewhere), signedIn, env)).status,
        elsewhere,
      ).toBe(400);
    }
    const foreign = await decide("allow", {
      cookie: await cookie(),
      origin: "https://evil.test",
    });
    expect(foreign.status).toBe(403);
    expect(await findGrant(env, "u1", "dns")).toBeNull();
    const offCabinet = await decide(
      "allow",
      { cookie: await cookie(), origin: ISSUER },
      { client_id: "dns", returnTo: "https://evil.test/" },
    );
    expect(offCabinet.status).toBe(400);
    expect(await findGrant(env, "u1", "dns")).toBeNull();
  });
});
