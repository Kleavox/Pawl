import { decodeBase64Url } from "@pawl/crypto";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../env";
import {
  createSession,
  deleteSession,
  invalidateUserSessions,
} from "../lib/session";
import {
  migratedDb,
  seedClient,
  seedUser,
  type TestDb,
} from "../oidc/db.testkit";
import { mintAccessToken } from "../oidc/tokens";
import { registerInternalRoutes } from "./internal";
import type { AppEnv } from "./shared";

const ISSUER = "https://paw.product.test";
const LONG_AGO = 20 * 60 * 1000;

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

function payloadOf(token: string): Record<string, unknown> {
  return JSON.parse(
    new TextDecoder().decode(decodeBase64Url(token.split(".")[1] ?? "")),
  ) as Record<string, unknown>;
}

async function sessionOf(userId: string) {
  return createSession(
    env,
    {
      id: userId,
      email: `${userId}@product.test`,
      username: userId,
      role: "USER",
    },
    1,
  );
}

async function expiredToken(input: {
  sub: string;
  client?: string;
  sid?: string;
  key?: string;
}): Promise<string> {
  vi.useFakeTimers({ now: Date.now() - LONG_AGO, toFake: ["Date"] });
  try {
    const client = input.client ?? "gateway";
    return await mintAccessToken(
      input.key ? { ...env, OIDC_SIGNING_KEY: input.key } : env,
      {
        audience: [client, ISSUER],
        sub: input.sub,
        scopes: ["openid", "email", "profile"],
        clientId: client,
        identity: {
          role: "USER",
          ...(input.sid === undefined ? {} : { sid: input.sid }),
        },
      },
    );
  } finally {
    vi.useRealTimers();
  }
}

function renew(token: string, host = "pass.internal") {
  return app.request(
    `http://${host}/internal/renew`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    },
    env,
  );
}

beforeEach(async () => {
  db = migratedDb();
  seedUser(db, { id: "u1", email: "u1@product.test", username: "u1" });
  seedUser(db, { id: "u2", email: "u2@product.test", username: "u2" });
  seedClient(db, {
    id: "gateway",
    redirectUris: ["https://product.test/auth/callback"],
    firstParty: true,
  });
  seedClient(db, {
    id: "dns",
    redirectUris: ["https://dns.elsewhere.test/cb"],
    firstParty: false,
  });
  env = {
    ENVIRONMENT: "production",
    PUBLIC_ORIGIN: ISSUER,
    ROOT_DOMAIN: "product.test",
    DB: db.DB,
    SESSIONS: kv(),
    OIDC_SIGNING_KEY: await signingKey(),
    OIDC_SUB_SECRET: "pairwise-secret",
  } as unknown as Env;
  app = new Hono<AppEnv>();
  registerInternalRoutes(app);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/internal/renew", () => {
  it("renews a first-party token while the Pawl session it came from lives", async () => {
    const { session } = await sessionOf("u1");
    db.sqlite.prepare("UPDATE users SET role = 'ADMIN' WHERE id = 'u1'").run();
    const response = await renew(
      await expiredToken({ sub: "u1", sid: session.sessionId }),
    );
    expect(response.status).toBe(200);
    const { access_token } = (await response.json()) as {
      access_token: string;
    };
    const claims = payloadOf(access_token);
    expect(claims).toMatchObject({
      sub: "u1",
      client_id: "gateway",
      aud: ["gateway", ISSUER],
      sid: session.sessionId,
      role: "ADMIN",
      email: "u1@product.test",
    });
    expect(Number(claims.exp) * 1000).toBeGreaterThan(Date.now());
  });

  it("ends with the Pawl session", async () => {
    const { token, session } = await sessionOf("u1");
    const expired = await expiredToken({ sub: "u1", sid: session.sessionId });
    await deleteSession(env, token);
    const response = await renew(expired);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "session_ended" });
  });

  it("ends when every session of the account was ended", async () => {
    const { session } = await sessionOf("u1");
    const expired = await expiredToken({ sub: "u1", sid: session.sessionId });
    await invalidateUserSessions(env, "u1", 2);
    expect((await renew(expired)).status).toBe(401);
  });

  it("ends with the account", async () => {
    const { session } = await sessionOf("u1");
    const expired = await expiredToken({ sub: "u1", sid: session.sessionId });
    db.sqlite
      .prepare("UPDATE users SET disabled_at = '2026-10-19' WHERE id = 'u1'")
      .run();
    expect((await renew(expired)).status).toBe(401);
  });

  it("never renews a token that names no Pawl session", async () => {
    await sessionOf("u1");
    expect((await renew(await expiredToken({ sub: "u1" }))).status).toBe(401);
  });

  it("never renews a token into someone else's session", async () => {
    const { session } = await sessionOf("u2");
    const response = await renew(
      await expiredToken({ sub: "u1", sid: session.sessionId }),
    );
    expect(response.status).toBe(401);
  });

  it("never renews a third-party token", async () => {
    const { session } = await sessionOf("u1");
    const response = await renew(
      await expiredToken({ sub: "u1", client: "dns", sid: session.sessionId }),
    );
    expect(response.status).toBe(401);
  });

  it("never renews a token Pawl did not sign", async () => {
    const { session } = await sessionOf("u1");
    const forged = await expiredToken({
      sub: "u1",
      sid: session.sessionId,
      key: await signingKey(),
    });
    expect((await renew(forged)).status).toBe(401);
  });

  it("is not reachable from outside", async () => {
    const { session } = await sessionOf("u1");
    const expired = await expiredToken({ sub: "u1", sid: session.sessionId });
    expect((await renew(expired, "paw.product.test")).status).toBe(404);
  });
});
