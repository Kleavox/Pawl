import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../app";
import type { Env } from "../env";
import { hashAuthVerifier, hashToken } from "../lib/crypto";
import { migratedDb, seedUser, type TestDb } from "../oidc/db.testkit";

const ORIGIN = "https://pass.product.test";
const VERIFIER = "v".repeat(43);
const WRONG = "w".repeat(43);

let db: TestDb;
let env: Env;
let store: Map<string, string>;
let fingerprints = 0;

function limiter(allowed: number) {
  const counts = new Map<string, number>();
  return {
    limit: vi.fn(async ({ key }: { key: string }) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { success: count <= allowed };
    }),
  };
}

function kv() {
  store = new Map<string, string>();
  return {
    get: async (key: string, type?: string) => {
      const value = store.get(key) ?? null;
      return value !== null && type === "json" ? JSON.parse(value) : value;
    },
    getWithMetadata: async (key: string) => ({
      value: store.get(key) ?? null,
      metadata: null,
    }),
    put: vi.fn(
      async (key: string, value: string) => void store.set(key, value),
    ),
    delete: async (key: string) => void store.delete(key),
    list: async () => ({ keys: [] }),
  };
}

function freshFingerprint(): string {
  fingerprints += 1;
  return `ciphers-${fingerprints}`;
}

function post(
  path: string,
  body: unknown,
  options: { fingerprint: string; cookie?: string; ip?: string },
) {
  const request = new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "cf-connecting-ip": options.ip ?? "203.0.113.7",
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  Object.defineProperty(request, "cf", {
    value: {
      tlsClientCiphersSha1: options.fingerprint,
      tlsClientExtensionsSha1: "extensions",
    },
  });
  return app.request(request, undefined, env);
}

function login(
  email: string,
  authVerifier: string,
  options: { fingerprint: string; cookie?: string; ip?: string },
) {
  return post("/api/login", { email, authVerifier }, options);
}

async function humanCookie(): Promise<string> {
  const token = "passed-the-check";
  store.set(
    `verification:${await hashToken(token)}`,
    JSON.stringify({
      scope: "basic",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      ip: "203.0.113.7",
    }),
  );
  return `__Secure-pawl_verified=${token}`;
}

function deviceCookie(response: Response): string {
  const line = response.headers
    .getSetCookie()
    .find((entry) => entry.startsWith("__Host-pawl_device="));
  if (!line) throw new Error("no device cookie");
  return line.split(";")[0]!;
}

function audited(): number {
  return (
    db.sqlite.prepare("SELECT count(*) AS n FROM auth_events").get() as {
      n: number;
    }
  ).n;
}

beforeEach(async () => {
  db = migratedDb();
  seedUser(db, { id: "u1", email: "ana@product.test", username: "ana" });
  seedUser(db, { id: "u2", email: "budi@product.test", username: "budi" });
  for (const id of ["u1", "u2"]) {
    db.sqlite
      .prepare(
        `INSERT INTO account_keys
         (user_id, kdf_salt, auth_verifier_hash, account_public_key, wrapped_private_key)
         VALUES (?, 'salt', ?, 'public', 'wrapped')`,
      )
      .run(id, await hashAuthVerifier(VERIFIER));
  }
  env = {
    ENVIRONMENT: "production",
    PUBLIC_ORIGIN: ORIGIN,
    ROOT_DOMAIN: "product.test",
    FROM_EMAIL: "Product <no-reply@product.test>",
    DB: db.DB,
    SESSIONS: kv(),
    OIDC_SUB_SECRET: "pairwise-secret",
    SIGNIN_RATE_LIMIT: limiter(1000),
    SIGNIN_TRY_LIMIT: limiter(1000),
    SIGNIN_FAILURE_LIMIT: limiter(1000),
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as Env;
});

describe("signing in while someone tries many passwords", () => {
  it("checks a first attempt from an unknown device as usual", async () => {
    const response = await login("ana@product.test", WRONG, {
      fingerprint: freshFingerprint(),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: "invalid_credentials",
    });
  });

  it("asks an unknown device for a human once its kind of client fails too often, without reading the database", async () => {
    env.SIGNIN_FAILURE_LIMIT = limiter(2);
    const fingerprint = freshFingerprint();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await login("ana@product.test", WRONG, { fingerprint });
    }
    const prepare = vi.spyOn(db.DB, "prepare");
    const response = await login("budi@product.test", WRONG, {
      fingerprint,
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "challenge_required",
    });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("asks an unknown device for a human once its kind of client tries too often", async () => {
    env.SIGNIN_TRY_LIMIT = limiter(2);
    const fingerprint = freshFingerprint();
    await login("ana@product.test", WRONG, { fingerprint });
    await login("ana@product.test", WRONG, { fingerprint });
    const response = await login("ana@product.test", VERIFIER, {
      fingerprint,
    });
    expect(response.status).toBe(403);
  });

  it("lets a person who passed the human check sign in", async () => {
    env.SIGNIN_TRY_LIMIT = limiter(0);
    const response = await login("ana@product.test", VERIFIER, {
      fingerprint: freshFingerprint(),
      cookie: await humanCookie(),
    });
    expect(response.status).toBe(200);
  });

  it("never asks a device that signed this account in before, and only for this account", async () => {
    const fingerprint = freshFingerprint();
    const first = await login("ana@product.test", VERIFIER, { fingerprint });
    expect(first.status).toBe(200);
    const cookie = deviceCookie(first);
    env.SIGNIN_TRY_LIMIT = limiter(0);
    expect(
      (await login("ana@product.test", VERIFIER, { fingerprint, cookie }))
        .status,
    ).toBe(200);
    expect(
      (await login("budi@product.test", VERIFIER, { fingerprint, cookie }))
        .status,
    ).toBe(403);
  });

  it("remembers at most three accounts on one device, the newest first", async () => {
    const fingerprint = freshFingerprint();
    let cookie = "";
    for (const [id, email] of [
      ["u3", "c@product.test"],
      ["u4", "d@product.test"],
      ["u5", "e@product.test"],
    ] as const) {
      seedUser(db, { id, email });
      db.sqlite
        .prepare(
          `INSERT INTO account_keys
           (user_id, kdf_salt, auth_verifier_hash, account_public_key, wrapped_private_key)
           VALUES (?, 'salt', ?, 'public', 'wrapped')`,
        )
        .run(id, await hashAuthVerifier(VERIFIER));
    }
    for (const email of [
      "ana@product.test",
      "c@product.test",
      "d@product.test",
      "e@product.test",
    ]) {
      cookie = deviceCookie(
        await login(email, VERIFIER, { fingerprint, cookie }),
      );
    }
    expect(cookie.split("=")[1]!.split(".")).toHaveLength(3);
    env.SIGNIN_TRY_LIMIT = limiter(0);
    expect(
      (await login("e@product.test", VERIFIER, { fingerprint, cookie })).status,
    ).toBe(200);
    expect(
      (await login("ana@product.test", VERIFIER, { fingerprint, cookie }))
        .status,
    ).toBe(403);
  });

  it("counts attempts at the edge instead of writing them down", async () => {
    env.SIGNIN_RATE_LIMIT = limiter(1);
    const fingerprint = freshFingerprint();
    await login("ana@product.test", WRONG, { fingerprint });
    const response = await login("ana@product.test", WRONG, { fingerprint });
    expect(response.status).toBe(429);
    const written = vi
      .mocked(env.SESSIONS.put)
      .mock.calls.map(([key]) => String(key));
    expect(written.filter((key) => key.startsWith("rate:"))).toEqual([]);
  });

  it("sends no email to a request it holds for a human", async () => {
    env.SIGNIN_TRY_LIMIT = limiter(0);
    const send = vi.spyOn(globalThis, "fetch");
    const response = await post(
      "/api/auth/otp/start",
      { email: "ana@product.test" },
      { fingerprint: freshFingerprint() },
    );
    expect(response.status).toBe(403);
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });

  it("holds the code check too", async () => {
    env.SIGNIN_TRY_LIMIT = limiter(0);
    const response = await post(
      "/api/auth/otp/verify",
      { email: "ana@product.test", code: "123456" },
      { fingerprint: freshFingerprint() },
    );
    expect(response.status).toBe(403);
  });

  it("writes down failed attempts only for an account that exists", async () => {
    const before = audited();
    await login("nobody@product.test", WRONG, {
      fingerprint: freshFingerprint(),
    });
    expect(audited()).toBe(before);
    await login("ana@product.test", WRONG, {
      fingerprint: freshFingerprint(),
    });
    expect(audited()).toBe(before + 1);
  });
});
