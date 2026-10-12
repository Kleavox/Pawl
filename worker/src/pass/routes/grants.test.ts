import { SESSION_COOKIE } from "@pawl/auth";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";

import type { Env } from "../env";
import { createSession } from "../lib/session";
import {
  migratedDb,
  seedClient,
  seedUser,
  type TestDb,
} from "../oidc/db.testkit";
import {
  issueRefreshToken,
  recordGrant,
  rotateRefreshToken,
} from "../oidc/grants";
import { registerGrantRoutes } from "./grants";
import type { AppEnv } from "./shared";

const ORIGIN = "https://paw.product.test";

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

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(
    env,
    {
      id: userId,
      email: `${userId}@product.test`,
      username: userId,
      role: "USER",
    },
    1,
  );
  return `${SESSION_COOKIE}=${token}`;
}

beforeEach(async () => {
  db = migratedDb();
  seedUser(db, { id: "user-1", email: "user-1@product.test", username: "one" });
  seedUser(db, { id: "user-2", email: "user-2@product.test", username: "two" });
  seedClient(db, {
    id: "docs",
    name: "Docs",
    redirectUris: ["https://docs.elsewhere.test/cb"],
    firstParty: false,
    sector: "docs.elsewhere.test",
  });
  seedClient(db, {
    id: "cabinet",
    name: "Cabinet",
    redirectUris: ["https://product.test/auth/callback"],
    firstParty: true,
  });
  env = {
    ENVIRONMENT: "production",
    PUBLIC_ORIGIN: ORIGIN,
    ROOT_DOMAIN: "product.test",
    DB: db.DB,
    SESSIONS: kv(),
  } as unknown as Env;
  app = new Hono<AppEnv>();
  registerGrantRoutes(app);
  await recordGrant(env, "user-1", "docs", "pairwise-1", ["openid", "email"]);
  await recordGrant(env, "user-1", "cabinet", "user-1", ["openid"]);
  await recordGrant(env, "user-2", "docs", "pairwise-2", ["openid"]);
});

async function listed(userId: string) {
  const response = await app.request(
    `${ORIGIN}/api/account/grants`,
    { headers: { cookie: await cookieFor(userId) } },
    env,
  );
  return {
    status: response.status,
    body: (await response.json()) as {
      grants?: Array<Record<string, unknown>>;
    },
  };
}

function revoke(cookie: string, clientId: string) {
  return app.request(
    `${ORIGIN}/api/account/grants/${clientId}`,
    {
      method: "DELETE",
      headers: { cookie, "content-type": "application/json", origin: ORIGIN },
    },
    env,
  );
}

describe("the apps a person has connected", () => {
  it("lists the third-party apps this person let in, and what each may read", async () => {
    const { body } = await listed("user-1");
    expect(body.grants).toEqual([
      expect.objectContaining({
        clientId: "docs",
        name: "Docs",
        sector: "docs.elsewhere.test",
        scopes: ["openid", "email"],
      }),
    ]);
  });

  it("asks who is signed in first", async () => {
    const response = await app.request(`${ORIGIN}/api/account/grants`, {}, env);
    expect(response.status).toBe(401);
  });

  it("revokes one, and the app's refresh token stops working", async () => {
    const grant = await recordGrant(env, "user-1", "docs", "pairwise-1", [
      "openid",
      "email",
    ]);
    const refresh = await issueRefreshToken(env, grant.id);
    const response = await revoke(await cookieFor("user-1"), "docs");
    expect(response.status).toBe(204);
    expect((await listed("user-1")).body.grants).toEqual([]);
    expect((await rotateRefreshToken(env, refresh, "docs")).kind).toBe(
      "rejected",
    );
  });

  it("never revokes another person's grant", async () => {
    await revoke(await cookieFor("user-1"), "docs");
    expect((await listed("user-2")).body.grants).toEqual([
      expect.objectContaining({ clientId: "docs" }),
    ]);
  });

  it("says so when there is nothing to revoke", async () => {
    const response = await revoke(await cookieFor("user-1"), "nobody");
    expect(response.status).toBe(404);
  });
});
