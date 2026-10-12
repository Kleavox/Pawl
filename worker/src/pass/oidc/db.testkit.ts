import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export interface TestDb {
  DB: D1Database;
  sqlite: DatabaseSync;
}

export function migratedDb(): TestDb {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrations = new URL("../../../migrations/", import.meta.url);
  for (const file of readdirSync(migrations).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  }

  const statement = (sql: string, args: SQLInputValue[] = []) => ({
    bind: (...next: SQLInputValue[]) => statement(sql, next),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => ({
      meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) },
    }),
  });

  const DB = {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: ReturnType<typeof statement>[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const each of statements) results.push(await each.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (cause) {
        sqlite.exec("ROLLBACK");
        throw cause;
      }
    },
  };

  return { DB: DB as unknown as D1Database, sqlite };
}

export function seedUser(
  db: TestDb,
  user: {
    id: string;
    email: string;
    username?: string | null;
    verified?: boolean;
  },
): void {
  db.sqlite
    .prepare(
      `INSERT INTO users (id, email, username, email_verified_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      user.id,
      user.email,
      user.username ?? null,
      user.verified === false ? null : "2026-10-08T00:00:00.000Z",
    );
}

export function seedClient(
  db: TestDb,
  client: {
    id: string;
    redirectUris: string[];
    firstParty: boolean;
    confidential?: boolean;
    secretHash?: string | null;
    sector?: string;
    scopes?: string[];
    name?: string;
  },
): void {
  db.sqlite
    .prepare(
      `INSERT INTO oauth_clients
       (id, name, redirect_uris, allowed_scopes, confidential, first_party,
        secret_hash, sector, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-10-08T00:00:00.000Z')`,
    )
    .run(
      client.id,
      client.name ?? client.id,
      JSON.stringify(client.redirectUris),
      JSON.stringify(client.scopes ?? ["openid", "email", "profile"]),
      client.confidential === false ? 0 : 1,
      client.firstParty ? 1 : 0,
      client.secretHash ?? null,
      client.sector ?? new URL(client.redirectUris[0] ?? "https://x").host,
    );
}
