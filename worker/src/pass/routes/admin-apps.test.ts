import { SESSION_COOKIE } from "@pawl/auth";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";

import type { Env } from "../env";
import { hashToken } from "../lib/crypto";
import { createSession } from "../lib/session";
import { migratedDb, seedUser, type TestDb } from "../oidc/db.testkit";
import { findOutsideApp } from "../oidc/outside";
import { registerAdminAppRoutes } from "./admin-apps";
import type { AppEnv } from "./shared";

const ORIGIN = "https://paw.product.test";

let db: TestDb;
let env: Env;
let app: Hono<AppEnv>;
let store: Map<string, string>;

function kv() {
  store = new Map<string, string>();
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

async function cookieFor(
  role: "ADMIN" | "USER",
  minutesAgo = 0,
): Promise<string> {
  const { token } = await createSession(
    env,
    { id: `${role}-1`, email: `${role}@product.test`, username: role, role },
    1,
  );
  if (minutesAgo > 0) {
    const key = `session:${await hashToken(token)}`;
    const stored = JSON.parse(store.get(key) ?? "{}") as { createdAt: string };
    stored.createdAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
    store.set(key, JSON.stringify(stored));
  }
  return `${SESSION_COOKIE}=${token}`;
}

const NEW_APP = {
  title: "DNS",
  label: "dns",
  address: "https://enroll.elsewhere.test",
  returnTo: null,
  access: "visitor",
  card: true,
};

function post(cookie: string | null, body: unknown = NEW_APP) {
  return app.request(
    `${ORIGIN}/api/admin/apps`,
    {
      method: "POST",
      headers: {
        ...(cookie ? { cookie } : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

beforeEach(() => {
  db = migratedDb();
  seedUser(db, { id: "ADMIN-1", email: "ADMIN@product.test" });
  seedUser(db, { id: "USER-1", email: "USER@product.test" });
  env = {
    ENVIRONMENT: "production",
    PUBLIC_ORIGIN: ORIGIN,
    ROOT_DOMAIN: "product.test",
    DB: db.DB,
    SESSIONS: kv(),
  } as unknown as Env;
  app = new Hono<AppEnv>();
  registerAdminAppRoutes(app);
});

describe("registered apps, for the admin", () => {
  it("registers an app for a recently signed-in admin and shows the secret once", async () => {
    const response = await post(await cookieFor("ADMIN", 5));
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      app: { key: string; clientId: string };
      secret: string;
    };
    expect(body.app).toMatchObject({ key: "dns", clientId: "dns" });
    expect(body.secret.length).toBeGreaterThanOrEqual(32);
    const listed = await app.request(
      `${ORIGIN}/api/admin/apps`,
      { headers: { cookie: await cookieFor("ADMIN") } },
      env,
    );
    const apps = ((await listed.json()) as { apps: unknown[] }).apps;
    expect(apps).toEqual([expect.objectContaining({ key: "dns" })]);
    expect(JSON.stringify(apps)).not.toContain(body.secret);
    const audit = db.sqlite
      .prepare("SELECT event_type FROM auth_events")
      .all() as { event_type: string }[];
    expect(audit.map((row) => row.event_type)).toContain("app_registered");
  });

  it("asks a signed-out person to sign in and refuses everyone but an admin", async () => {
    expect((await post(null)).status).toBe(401);
    const user = await cookieFor("USER");
    expect((await post(user)).status).toBe(403);
    const listed = await app.request(
      `${ORIGIN}/api/admin/apps`,
      { headers: { cookie: user } },
      env,
    );
    expect(listed.status).toBe(403);
    expect(await findOutsideApp(env, "dns")).toBeNull();
  });

  it("asks an admin whose sign-in is older than fifteen minutes to sign in again", async () => {
    const response = await post(await cookieFor("ADMIN", 16));
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe(
      "reauth_required",
    );
    expect(await findOutsideApp(env, "dns")).toBeNull();
  });

  it("says what is wrong with a form it cannot store", async () => {
    const response = await post(await cookieFor("ADMIN"), {
      ...NEW_APP,
      address: "http://enroll.elsewhere.test",
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toContain(
      "address",
    );
    expect((await post(await cookieFor("ADMIN"), { title: 1 })).status).toBe(
      400,
    );
  });

  it("removes an app for a recent admin, and only then", async () => {
    await post(await cookieFor("ADMIN"));
    const remove = (cookie: string) =>
      app.request(
        `${ORIGIN}/api/admin/apps/dns`,
        {
          method: "DELETE",
          headers: { cookie, "content-type": "application/json" },
        },
        env,
      );
    expect((await remove(await cookieFor("USER"))).status).toBe(403);
    expect((await remove(await cookieFor("ADMIN", 20))).status).toBe(403);
    expect((await remove(await cookieFor("ADMIN"))).status).toBe(204);
    expect(await findOutsideApp(env, "dns")).toBeNull();
    expect((await remove(await cookieFor("ADMIN"))).status).toBe(404);
  });
});
