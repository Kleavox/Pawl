import type { AccountCredential } from "@pawl/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../env";
import { migratedDb, seedClient, seedUser } from "../oidc/db.testkit";
import { issueRefreshToken, recordGrant } from "../oidc/grants";
import { createAccountLifecycle } from "./lifecycle";

const credential: AccountCredential = {
  salt: "salt-value",
  authVerifier: "auth-verifier",
  accountPublicKey: "account-public-key",
  wrappedPrivateKey: "wrapped-private-key",
};

describe("AccountLifecycle", () => {
  let database: FakeDatabase;
  let sessions: FakeSessions;
  let linkFetch: ReturnType<typeof vi.fn>;
  let env: Env;

  beforeEach(() => {
    database = new FakeDatabase();
    sessions = new FakeSessions();
    linkFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    env = {
      DB: database as unknown as D1Database,
      SESSIONS: sessions as unknown as KVNamespace,
      LINK: { fetch: linkFetch } as unknown as Fetcher,
      IP_HASH_SECRET: "test-secret",
    } as Env;
  });

  it("sets the username and verifier-only credential in one D1 batch", async () => {
    database.first = (sql) => {
      if (sql.includes("SELECT username FROM users")) return { username: null };
      if (sql.includes("SELECT id FROM users WHERE username")) return null;
      return null;
    };

    const result = await createAccountLifecycle(env).setup({
      identity: {
        id: "user-1",
        email: "owner@example.com",
        username: null,
        role: "USER",
      },
      username: "owner",
      keys: credential,
      request: request(),
    });

    expect(result).toMatchObject({
      kind: "ready",
      identity: { username: "owner" },
    });
    expect(database.batches).toHaveLength(1);
    expect(database.batches[0]?.map((statement) => statement.sql)).toEqual([
      expect.stringContaining("UPDATE users"),
      expect.stringContaining("INSERT INTO account_keys"),
    ]);
    expect(sessions.put).toHaveBeenCalledWith(
      "identity:user-1",
      expect.stringContaining('"username":"owner"'),
      expect.any(Object),
    );
  });

  it("rotates a reset credential atomically before invalidating sessions", async () => {
    database.first = (sql) =>
      sql.includes("FROM verification_tokens")
        ? {
            id: "reset-1",
            user_id: "user-1",
            expires_at: "2026-07-18T11:00:00.000Z",
            auth_version: 7,
          }
        : null;

    const result = await createAccountLifecycle(env).resetCredential({
      tokenHash: "token-hash",
      keys: credential,
      request: request(),
      now: Date.parse("2026-07-18T10:00:00.000Z"),
    });

    expect(result).toEqual({ kind: "reset" });
    expect(database.batches[0]?.map((statement) => statement.sql)).toEqual([
      expect.stringContaining("INSERT INTO account_keys"),
      expect.stringContaining("UPDATE users"),
      expect.stringContaining("UPDATE verification_tokens"),
      expect.stringContaining("DELETE FROM verification_tokens"),
    ]);
    expect(sessions.put).toHaveBeenCalledWith("auth-version:user-1", "8");
    expect(sessions.list).toHaveBeenCalledWith({
      prefix: "usersession:user-1:",
    });
  });

  it("takes every Pawl grant and refresh token with a deleted account", async () => {
    const db = migratedDb();
    seedUser(db, { id: "user-1", email: "owner@product.test" });
    seedClient(db, {
      id: "krynodes-access",
      redirectUris: [
        "https://team.cloudflareaccess.com/cdn-cgi/access/callback",
      ],
      firstParty: false,
    });
    const real = { ...env, DB: db.DB } as Env;
    const grant = await recordGrant(real, "user-1", "krynodes-access", "p-1", [
      "openid",
    ]);
    await issueRefreshToken(real, grant.id);

    const result = await createAccountLifecycle(real).delete({
      userId: "user-1",
      request: request(),
    });

    expect(result).toEqual({ kind: "deleted" });
    for (const table of ["oauth_grants", "oauth_refresh_tokens"]) {
      expect(
        db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get(),
        table,
      ).toEqual({ n: 0 });
    }
  });

  it("does not delete the Pass account when the Link purge fails", async () => {
    linkFetch.mockResolvedValue(new Response(null, { status: 503 }));

    const result = await createAccountLifecycle(env).delete({
      userId: "user-1",
      request: request(),
    });

    expect(result).toEqual({ kind: "purge_failed" });
    expect(
      database.runs.some((statement) =>
        statement.sql.includes("DELETE FROM users"),
      ),
    ).toBe(false);
  });

  it("does not overwrite an existing verifier through the setup path", async () => {
    database.first = (sql) =>
      sql.includes("FROM account_keys")
        ? {
            kdf_salt: "old",
            auth_verifier_hash: "old",
            account_public_key: "old",
            wrapped_private_key: "old",
          }
        : null;

    const result = await createAccountLifecycle(env).setCredential({
      userId: "user-1",
      keys: credential,
      request: request(),
    });

    expect(result).toEqual({ kind: "exists" });
    expect(
      database.runs.some((statement) =>
        statement.sql.includes("INSERT INTO account_keys"),
      ),
    ).toBe(false);
  });
});

interface RecordedStatement {
  sql: string;
  values: unknown[];
}

class FakeDatabase {
  first: (sql: string, values: unknown[]) => unknown = () => null;
  batches: RecordedStatement[][] = [];
  runs: RecordedStatement[] = [];

  prepare(sql: string): D1PreparedStatement {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    this.batches.push(
      statements.map((statement) =>
        (statement as unknown as FakeStatement).record(),
      ),
    );
    return [];
  }
}

class FakeStatement {
  private readonly database: FakeDatabase;
  private readonly sql: string;
  private values: unknown[] = [];

  constructor(database: FakeDatabase, sql: string) {
    this.database = database;
    this.sql = sql;
  }

  bind(...values: unknown[]): this {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return this.database.first(this.sql, this.values) as T | null;
  }

  async run(): Promise<D1Result> {
    this.database.runs.push(this.record());
    return { success: true } as D1Result;
  }

  record(): RecordedStatement {
    return { sql: this.sql, values: this.values };
  }
}

class FakeSessions {
  put = vi.fn().mockResolvedValue(undefined);
  delete = vi.fn().mockResolvedValue(undefined);
  list = vi.fn().mockResolvedValue({ keys: [] });
}

function request(): Request {
  return new Request("https://pass.example.com/api/account", {
    headers: {
      "cf-connecting-ip": "127.0.0.1",
      "user-agent": "pawl-lifecycle-test",
    },
  });
}
