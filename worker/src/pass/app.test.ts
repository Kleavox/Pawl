import { describe, expect, it, vi } from "vitest";
import app from "./app";
import type { Env } from "./env";
import { hashToken } from "./lib/crypto";
import { fakeOtpDb } from "./lib/otp-db.testkit";
import { migratedDb } from "./oidc/db.testkit";
import { issueOtp } from "./lib/otp";
import { createSession } from "./lib/session";

const baseEnv = {
  ENVIRONMENT: "production",
  PUBLIC_ORIGIN: "https://pass.product.test",
  ROOT_DOMAIN: "product.test",
  FROM_EMAIL: "Product <no-reply@product.test>",
  ASSETS: {
    fetch: () => Promise.resolve(new Response("asset")),
  },
  SESSIONS: {
    get: () => Promise.resolve(null),
    put: () => Promise.resolve(),
    delete: () => Promise.resolve(),
  },
} as unknown as Env;

function otpDb(fallback: (sql: string) => unknown) {
  const made = fakeOtpDb(fallback);
  return { prepare: vi.fn(made.DB.prepare) };
}

function kvStore() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => void store.set(key, value),
    delete: async (key: string) => void store.delete(key),
  };
}

function otpStartInit(email: string): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://pass.product.test",
    },
    body: JSON.stringify({ email }),
  };
}

function otpVerifyInit(email: string, code: string): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://pass.product.test",
    },
    body: JSON.stringify({ email, code }),
  };
}

function dbStub(rows: Record<string, unknown>) {
  return otpDb(
    vi.fn((sql: string) => ({
      bind: (..._args: unknown[]) => ({
        first: async () => (/select/i.test(sql) ? rows : null),
        run: async () => undefined,
      }),
    })),
  );
}

describe("Pass HTTP boundary", () => {
  it("counts a person's signed-in devices for a service, and only for a service", async () => {
    const sessions = {
      ...baseEnv.SESSIONS,
      list: async ({ prefix }: { prefix: string }) => ({
        keys:
          prefix === "usersession:user-1:"
            ? [
                { name: "usersession:user-1:a", metadata: {} },
                { name: "usersession:user-1:b", metadata: {} },
              ]
            : [],
      }),
    };
    const env = { ...baseEnv, SESSIONS: sessions } as unknown as Env;
    const internal = await app.request(
      "http://pass.internal/internal/devices?id=user-1",
      {},
      env,
    );
    expect(await internal.json()).toEqual({ devices: 2 });
    const outside = await app.request(
      "https://pass.product.test/internal/devices?id=user-1",
      {},
      env,
    );
    expect(outside.status).toBe(404);
  });

  it("tells the gateway who is asking for the estate, and drops what a browser claimed", async () => {
    const forwarded: Request[] = [];
    const store = new Map<string, string>();
    const sessions = {
      get: async (key: string, type?: string) => {
        const value = store.get(key) ?? null;
        return value !== null && type === "json" ? JSON.parse(value) : value;
      },
      put: async (key: string, value: string) => void store.set(key, value),
      delete: async (key: string) => void store.delete(key),
    };
    const env = {
      ...baseEnv,
      SESSIONS: sessions,
      GATEWAY: {
        fetch: async (request: Request) => {
          forwarded.push(request);
          return Response.json({ role: "USER", tools: {}, attention: [] });
        },
      },
    } as unknown as Env;
    const { token } = await createSession(
      env,
      { id: "user-1", email: "o@product.test", username: "o", role: "ADMIN" },
      1,
    );
    await app.request(
      "https://pass.product.test/api/estate",
      {
        headers: {
          cookie: `__Secure-pawl_session=${token}`,
          "x-pawl-user": "victim",
        },
      },
      env,
    );
    await app.request(
      "https://pass.product.test/api/estate",
      { headers: { "x-pawl-user": "victim", "x-pawl-role": "ADMIN" } },
      env,
    );
    expect(forwarded.map((request) => request.url)).toEqual([
      "http://gateway.internal/api/estate",
      "http://gateway.internal/api/estate",
    ]);
    expect(forwarded[0]!.headers.get("x-pawl-user")).toBe("user-1");
    expect(forwarded[0]!.headers.get("x-pawl-role")).toBe("ADMIN");
    expect(forwarded[1]!.headers.get("x-pawl-user")).toBeNull();
    expect(forwarded[1]!.headers.get("x-pawl-role")).toBeNull();
  });

  it("names the Worker that answered in health and readiness, as tooling/health asserts", async () => {
    const health = await app.request(
      "https://pass.product.test/health",
      {},
      baseEnv,
    );
    expect(await health.json()).toEqual({ service: "pass", status: "ok" });

    const unmigrated = migratedDb();
    unmigrated.sqlite.exec("PRAGMA foreign_keys = OFF; DROP TABLE users");
    const ready = await app.request("https://pass.product.test/ready", {}, {
      ...baseEnv,
      DB: unmigrated.DB,
    } as unknown as Env);
    expect(await ready.json()).toEqual({
      service: "pass",
      status: "migration_required",
    });
  });

  it("is ready once every migration has been applied", async () => {
    const response = await app.request("https://pass.product.test/ready", {}, {
      ...baseEnv,
      DB: migratedDb().DB,
    } as unknown as Env);
    expect(response.status).toBe(200);
  });

  it("is not ready while any table a migration creates is missing", async () => {
    const tables = (
      migratedDb()
        .sqlite.prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
        )
        .all() as { name: string }[]
    ).map((row) => row.name);
    expect(tables).toContain("oauth_clients");
    expect(tables).toContain("otp_codes");

    for (const table of tables) {
      const db = migratedDb();
      db.sqlite.exec("PRAGMA foreign_keys = OFF");
      db.sqlite.exec(`DROP TABLE ${table}`);
      const response = await app.request(
        "https://pass.product.test/ready",
        {},
        { ...baseEnv, DB: db.DB } as unknown as Env,
      );
      expect(response.status, `ready without ${table}`).toBe(503);
    }
  });

  it("answers the OIDC endpoints itself rather than handing them to the app shell", async () => {
    const response = await app.request(
      "https://pass.product.test/.well-known/openid-configuration",
      {},
      baseEnv,
    );
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.text()).not.toBe("asset");
  });

  it("rejects state-changing requests from another origin", async () => {
    const response = await app.request(
      "https://pass.product.test/api/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: JSON.stringify({
          email: "person@example.com",
          password: "not-important",
        }),
      },
      baseEnv,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_origin",
    });
  });

  it("requires JSON for state-changing APIs", async () => {
    const response = await app.request(
      "https://pass.product.test/api/logout",
      {
        method: "POST",
        headers: { origin: "https://pass.product.test" },
      },
      baseEnv,
    );

    expect(response.status).toBe(415);
  });

  it("no longer answers another Worker's questions about a session", async () => {
    for (const [path, method] of [
      ["/internal/session", "GET"],
      ["/internal/logout", "POST"],
    ] as const) {
      const response = await app.request(
        `http://pass.internal${path}`,
        { method, headers: { "x-pawl-session": "abc" } },
        baseEnv,
      );
      expect(await response.text(), path).toBe("asset");
    }
  });

  it("reads the challenge a service sends in x-pawl-verification", async () => {
    const asked: string[] = [];
    const response = await app.request(
      "http://pass.internal/internal/challenge?scope=basic",
      { headers: { "x-pawl-verification": "tok" } },
      {
        ...baseEnv,
        SESSIONS: {
          ...baseEnv.SESSIONS,
          get: (key: string) => {
            asked.push(key);
            return Promise.resolve(null);
          },
        },
      },
    );

    expect(response.status).toBe(401);
    expect(asked.some((key) => key.startsWith("verification:"))).toBe(true);
  });

  it("reports configured OAuth providers without exposing credentials", async () => {
    const response = await app.request(
      "https://pass.product.test/api/oauth/providers",
      {},
      {
        ...baseEnv,
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      google: true,
      github: false,
    });
  });
});

describe("POST /api/auth/otp/start", () => {
  it("answers a known email and an unknown email byte-identically", async () => {
    const prepare = vi.fn((_sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () =>
          args[0] === "known@example.com" ? { id: "user-1" } : null,
      }),
    }));
    const env = {
      ...baseEnv,
      ENVIRONMENT: "development",
      SESSIONS: kvStore(),
      DB: otpDb(prepare),
    } as unknown as Env;

    const knownResponse = await app.request(
      "https://pass.product.test/api/auth/otp/start",
      otpStartInit("known@example.com"),
      env,
    );
    const knownText = await knownResponse.text();

    const unknownResponse = await app.request(
      "https://pass.product.test/api/auth/otp/start",
      otpStartInit("unknown@example.com"),
      env,
    );
    const unknownText = await unknownResponse.text();

    expect(unknownResponse.status).toBe(knownResponse.status);
    expect(unknownText).toBe(knownText);
  });

  it("never looks the account up", async () => {
    const prepare = vi.fn();
    const env = {
      ...baseEnv,
      ENVIRONMENT: "development",
      SESSIONS: kvStore(),
      DB: otpDb(prepare),
    } as unknown as Env;

    const response = await app.request(
      "https://pass.product.test/api/auth/otp/start",
      otpStartInit("someone@example.com"),
      env,
    );

    expect(response.status).toBe(200);
    expect(
      prepare.mock.calls.map(([sql]) => sql),
      "the code is stored under a hash of the email; nothing else may be read",
    ).toEqual([]);
  });

  it("says the code could not be sent instead of reporting success", async () => {
    const prepare = vi.fn();
    const env = {
      ...baseEnv,
      ENVIRONMENT: "development",
      RESEND_API_KEY: "test-key",
      SESSIONS: kvStore(),
      DB: otpDb(prepare),
    } as unknown as Env;
    const posted = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("no", { status: 500 }));

    const response = await app.request(
      "https://pass.product.test/api/auth/otp/start",
      otpStartInit("undeliverable@example.com"),
      env,
    );

    expect(posted).toHaveBeenCalled();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "email_delivery_failed",
    });
    posted.mockRestore();
  });

  it("tells a rate-limited caller how long to wait instead of dropping the request", async () => {
    const store = new Map<string, string>();
    const email = "rate-limited@example.com";
    const windowSeconds = 900;
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
    const key = `rate:otp-email:${await hashToken(email)}:${bucket}`;
    store.set(key, "5");
    const env = {
      ...baseEnv,
      ENVIRONMENT: "development",
      SESSIONS: {
        get: async (k: string) => store.get(k) ?? null,
        put: async (k: string, v: string) => void store.set(k, v),
        delete: async (k: string) => void store.delete(k),
      },
    } as unknown as Env;

    const response = await app.request(
      "https://pass.product.test/api/auth/otp/start",
      otpStartInit(email),
      env,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      code: "rate_limited",
    });
  });

  it("answers a failed send the same way for a known and an unknown email, and logs it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const prepare = vi.fn((_sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () =>
          args[0] === "known@example.com" ? { id: "user-1" } : null,
        run: async () => ({ meta: { changes: 1 } }),
      }),
    }));
    const env = {
      ...baseEnv,
      ENVIRONMENT: "production",
      RESEND_API_KEY: undefined,
      SESSIONS: kvStore(),
      DB: otpDb(prepare),
    } as unknown as Env;

    const known = await app.request(
      "https://pass.product.test/api/auth/otp/start",
      otpStartInit("known@example.com"),
      env,
    );
    const knownText = await known.text();
    const unknown = await app.request(
      "https://pass.product.test/api/auth/otp/start",
      otpStartInit("unknown@example.com"),
      env,
    );

    expect(known.status).toBe(503);
    expect(unknown.status).toBe(known.status);
    expect(await unknown.text()).toBe(knownText);
    expect(errorSpy).toHaveBeenCalledWith(
      "[pass otp email]",
      expect.any(Error),
    );

    errorSpy.mockRestore();
  });

  it("rejects an untrusted origin", async () => {
    const response = await app.request(
      "https://pass.product.test/api/auth/otp/start",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: JSON.stringify({ email: "someone@example.com" }),
      },
      { ...baseEnv, SESSIONS: kvStore() } as unknown as Env,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_origin",
    });
  });

  it("rejects a non-JSON content type", async () => {
    const response = await app.request(
      "https://pass.product.test/api/auth/otp/start",
      {
        method: "POST",
        headers: { origin: "https://pass.product.test" },
        body: JSON.stringify({ email: "someone@example.com" }),
      },
      { ...baseEnv, SESSIONS: kvStore() } as unknown as Env,
    );

    expect(response.status).toBe(415);
  });
});

describe("POST /api/auth/otp/verify", () => {
  it("rejects a code when none was ever issued, and touches no table", async () => {
    const prepare = vi.fn();
    const response = await app.request(
      "https://pass.product.test/api/auth/otp/verify",
      otpVerifyInit("person@example.com", "000000"),
      { ...baseEnv, DB: otpDb(prepare) } as unknown as Env,
    );

    expect(response.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("checks the code before it ever looks the account up", async () => {
    const prepare = vi.fn();
    await app.request(
      "https://pass.product.test/api/auth/otp/verify",
      otpVerifyInit("disabled@example.com", "000000"),
      { ...baseEnv, DB: otpDb(prepare) } as unknown as Env,
    );

    expect(prepare).not.toHaveBeenCalled();
  });

  it("refuses a body that is not an email and a six digit code", async () => {
    const response = await app.request(
      "https://pass.product.test/api/auth/otp/verify",
      otpVerifyInit("not-an-email", "12"),
      baseEnv,
    );

    expect(response.status).toBe(400);
  });

  it("rejects an untrusted origin", async () => {
    const response = await app.request(
      "https://pass.product.test/api/auth/otp/verify",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: JSON.stringify({ email: "person@example.com", code: "000000" }),
      },
      baseEnv,
    );

    expect(response.status).toBe(403);
  });

  it("rejects an issued but wrong code without looking the account up, and reports a different reason than an expired code", async () => {
    const store = kvStore();
    const email = "person@example.com";
    const env = {
      ...baseEnv,
      SESSIONS: store,
      DB: otpDb(vi.fn()),
    } as unknown as Env;
    const issued = await issueOtp(env, email);
    const wrongCode = issued === "111111" ? "222222" : "111111";

    const response = await app.request(
      "https://pass.product.test/api/auth/otp/verify",
      otpVerifyInit(email, wrongCode),
      env,
    );
    const body = await response.json();

    const expiredResponse = await app.request(
      "https://pass.product.test/api/auth/otp/verify",
      otpVerifyInit("nobody-ever-issued@example.com", "000000"),
      env,
    );
    const expiredBody = await expiredResponse.json();

    expect(response.status).toBe(401);
    const statements = (
      env.DB as unknown as { prepare: ReturnType<typeof vi.fn> }
    ).prepare.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.filter((sql) => !sql.includes("otp_codes")),
      "a wrong code must be refused without a single word about the account",
    ).toEqual([]);
    expect(body).not.toEqual(expiredBody);
    expect(body).toMatchObject({ code: "invalid_code", attemptsLeft: 4 });
    expect(expiredBody).not.toHaveProperty("attemptsLeft");
  });

  it("answers an email with an account and one without byte-identically on a wrong code", async () => {
    const store = kvStore();
    const prepare = vi.fn((_sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () =>
          args[0] === "known@example.com" ? { id: "user-1" } : null,
      }),
    }));
    const env = {
      ...baseEnv,
      SESSIONS: store,
      DB: otpDb(prepare),
    } as unknown as Env;

    const knownIssued = await issueOtp(env, "known@example.com");
    const knownWrong = knownIssued === "111111" ? "222222" : "111111";
    const unknownIssued = await issueOtp(env, "unknown@example.com");
    const unknownWrong = unknownIssued === "111111" ? "222222" : "111111";

    const knownResponse = await app.request(
      "https://pass.product.test/api/auth/otp/verify",
      otpVerifyInit("known@example.com", knownWrong),
      env,
    );
    const knownText = await knownResponse.text();

    const unknownResponse = await app.request(
      "https://pass.product.test/api/auth/otp/verify",
      otpVerifyInit("unknown@example.com", unknownWrong),
      env,
    );
    const unknownText = await unknownResponse.text();

    expect(unknownResponse.status).toBe(knownResponse.status);
    expect(unknownText).toBe(knownText);
  });

  it("counts down the attempts left in the body, then stops sending a count once they run out", async () => {
    const store = kvStore();
    const email = "counting@example.com";
    const env = {
      ...baseEnv,
      SESSIONS: store,
      DB: otpDb(vi.fn()),
    } as unknown as Env;
    const issued = await issueOtp(env, email);
    const wrongCode = issued === "111111" ? "222222" : "111111";

    const bodies: Array<{ code: string; attemptsLeft?: number }> = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.request(
        "https://pass.product.test/api/auth/otp/verify",
        otpVerifyInit(email, wrongCode),
        env,
      );
      bodies.push(
        (await response.json()) as { code: string; attemptsLeft?: number },
      );
    }

    expect(bodies.map((body) => body.attemptsLeft)).toEqual([
      4,
      3,
      2,
      1,
      undefined,
    ]);
    expect(bodies.map((body) => body.code)).toEqual([
      "invalid_code",
      "invalid_code",
      "invalid_code",
      "invalid_code",
      "too_many_attempts",
    ]);
  });

  it("signs in a known, verified user and reports no setup is needed", async () => {
    const store = kvStore();
    const email = "verified@example.com";
    const db = dbStub({
      id: "user-1",
      email,
      username: "someone",
      role: "USER",
      email_verified_at: "2020-01-01T00:00:00.000Z",
      auth_version: 1,
      disabled_at: null,
      identity_id: null,
      password_hash: null,
    });
    const env = { ...baseEnv, SESSIONS: store, DB: db } as unknown as Env;
    const code = await issueOtp(env, email);

    const response = await app.request(
      "https://pass.product.test/api/auth/otp/verify",
      otpVerifyInit(email, code),
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      authenticated: true,
      user: {
        id: "user-1",
        email,
        username: "someone",
        role: "USER",
      },
      needsSetup: false,
    });
    expect(response.headers.get("Set-Cookie")).toContain(
      "__Secure-pawl_session=",
    );
    expect(
      db.prepare.mock.calls.some((call) =>
        /auth_events/i.test(call[0] as string),
      ),
    ).toBe(true);
    expect(
      db.prepare.mock.calls.some((call) =>
        /email_verified_at\s*=/i.test(call[0] as string),
      ),
    ).toBe(false);
  });

  it("records the sign-in as a login, the way password and OAuth sign-ins both do", async () => {
    const store = kvStore();
    const email = "logged@example.com";
    const db = dbStub({
      id: "user-3",
      email,
      username: "someone",
      role: "USER",
      email_verified_at: "2020-01-01T00:00:00.000Z",
      auth_version: 1,
      disabled_at: null,
      identity_id: null,
      password_hash: null,
    });
    const env = { ...baseEnv, SESSIONS: store, DB: db } as unknown as Env;
    const code = await issueOtp(env, email);

    const response = await app.request(
      "https://pass.product.test/api/auth/otp/verify",
      otpVerifyInit(email, code),
      env,
    );

    expect(response.status).toBe(200);
    expect(
      db.prepare.mock.calls.some((call) =>
        /last_login_at\s*=/i.test(call[0] as string),
      ),
    ).toBe(true);
  });

  it("keeps the session a code mints on Pawl's own host", async () => {
    const store = kvStore();
    const email = "proxied@example.com";
    const db = dbStub({
      id: "user-4",
      email,
      username: "someone",
      role: "USER",
      email_verified_at: "2020-01-01T00:00:00.000Z",
      auth_version: 1,
      disabled_at: null,
      identity_id: null,
      password_hash: null,
    });
    const env = { ...baseEnv, SESSIONS: store, DB: db } as unknown as Env;
    const code = await issueOtp(env, email);

    const response = await app.request(
      "https://pass.product.test/api/auth/otp/verify",
      otpVerifyInit(email, code),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain(
      "__Secure-pawl_session=",
    );
    expect(response.headers.get("Set-Cookie")).not.toContain("Domain=");
  });

  it("cannot scope the session cookie at all when it is handed an internal hostname", async () => {
    const store = kvStore();
    const email = "internal@example.com";
    const db = dbStub({
      id: "user-5",
      email,
      username: "someone",
      role: "USER",
      email_verified_at: "2020-01-01T00:00:00.000Z",
      auth_version: 1,
      disabled_at: null,
      identity_id: null,
      password_hash: null,
    });
    const env = { ...baseEnv, SESSIONS: store, DB: db } as unknown as Env;
    const code = await issueOtp(env, email);

    const response = await app.request(
      "http://pass.internal/api/auth/otp/verify",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://pass.internal",
        },
        body: JSON.stringify({ email, code }),
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).not.toContain("Domain=");
  });

  it("rate limits verification per email, not only per IP", async () => {
    const store = new Map<string, string>();
    const email = "hammered@example.com";
    const windowSeconds = 900;
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
    store.set(
      `rate:otp-verify-email:${await hashToken(email)}:${bucket}`,
      "10",
    );
    const env = {
      ...baseEnv,
      DB: otpDb(vi.fn()),
      SESSIONS: {
        get: async (k: string) => store.get(k) ?? null,
        put: async (k: string, v: string) => void store.set(k, v),
        delete: async (k: string) => void store.delete(k),
      },
    } as unknown as Env;

    const response = await app.request(
      "https://pass.product.test/api/auth/otp/verify",
      otpVerifyInit(email, "000000"),
      env,
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: "rate_limited",
    });
  });

  it("fills email_verified_at for an existing but unverified user, and reports setup is needed", async () => {
    const store = kvStore();
    const email = "unverified@example.com";
    const db = dbStub({
      id: "user-2",
      email,
      username: null,
      role: "USER",
      email_verified_at: null,
      auth_version: 1,
      disabled_at: null,
      identity_id: null,
      password_hash: null,
    });
    const env = { ...baseEnv, SESSIONS: store, DB: db } as unknown as Env;
    const code = await issueOtp(env, email);

    const response = await app.request(
      "https://pass.product.test/api/auth/otp/verify",
      otpVerifyInit(email, code),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ authenticated: true, needsSetup: true });
    expect(
      db.prepare.mock.calls.some((call) =>
        /update users.*email_verified_at/is.test(call[0] as string),
      ),
    ).toBe(true);
  });
});

describe("the cabinet's code routes", () => {
  const CABINET = "https://product.test";

  function fromCabinet(origin = CABINET): RequestInit {
    return {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email: "person@example.com", code: "000000" }),
    };
  }

  it("let the cabinet on the root origin send a code, and let it read the answer", async () => {
    const response = await app.request(
      "https://pass.product.test/api/auth/otp/verify",
      fromCabinet(),
      { ...baseEnv, DB: otpDb(vi.fn()) } as unknown as Env,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe(CABINET);
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
  });

  it("answer the cabinet's preflight, and nobody else's", async () => {
    const preflight = (origin: string) =>
      app.request(
        "https://pass.product.test/api/auth/otp/start",
        {
          method: "OPTIONS",
          headers: {
            origin,
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type",
          },
        },
        baseEnv,
      );
    const cabinet = await preflight(CABINET);
    expect(cabinet.status).toBe(204);
    expect(cabinet.headers.get("access-control-allow-origin")).toBe(CABINET);
    expect(cabinet.headers.get("access-control-allow-headers")).toBe(
      "content-type",
    );
    expect(cabinet.headers.get("access-control-allow-methods")).toBe("POST");
    const stranger = await preflight("https://attacker.example");
    expect(stranger.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("open no other API to the root origin", async () => {
    const response = await app.request(
      "https://pass.product.test/api/login",
      fromCabinet(),
      baseEnv,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("trust a local cabinet under either loopback name", async () => {
    const response = await app.request(
      "http://127.0.0.1:8787/api/auth/otp/verify",
      fromCabinet("http://localhost:8786"),
      { ...baseEnv, DB: otpDb(vi.fn()) } as unknown as Env,
    );
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:8786",
    );
  });

  it("trust the local cabinet beside a local Pawl", async () => {
    const response = await app.request(
      "http://127.0.0.1:8787/api/auth/otp/verify",
      fromCabinet("http://127.0.0.1:8786"),
      { ...baseEnv, DB: otpDb(vi.fn()) } as unknown as Env,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:8786",
    );
  });
});
