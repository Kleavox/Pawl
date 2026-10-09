import { beforeEach, describe, expect, it } from "vitest";

import type { Env } from "../env";
import { consumeCode, issueCode, type CodeInput } from "./codes";
import { migratedDb, seedClient, seedUser, type TestDb } from "./db.testkit";

const input: CodeInput = {
  clientId: "notes",
  userId: "user-1",
  redirectUri: "https://des.product.test/callback",
  codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  nonce: "n-0S6",
  scopes: ["openid", "email"],
};

let db: TestDb;
let env: Env;

beforeEach(() => {
  db = migratedDb();
  seedUser(db, { id: "user-1", email: "owner@product.test" });
  seedClient(db, {
    id: "notes",
    redirectUris: [input.redirectUri],
    firstParty: true,
  });
  env = { DB: db.DB } as Env;
});

describe("issueCode", () => {
  it("stores the hash of the code, never the code itself", async () => {
    const raw = await issueCode(env, input);
    const stored = JSON.stringify(
      db.sqlite.prepare("SELECT * FROM oauth_codes").all(),
    );
    expect(raw.length).toBeGreaterThanOrEqual(43);
    expect(stored).not.toContain(raw);
  });

  it("clears codes that expired long ago", async () => {
    db.sqlite
      .prepare(
        `INSERT INTO oauth_codes
         (code_hash, client_id, user_id, redirect_uri, code_challenge, scopes, expires_at)
         VALUES ('old', 'notes', 'user-1', 'x', 'y', '[]', '2020-01-01T00:00:00.000Z')`,
      )
      .run();
    await issueCode(env, input);
    expect(
      db.sqlite
        .prepare("SELECT code_hash FROM oauth_codes WHERE code_hash = 'old'")
        .get(),
    ).toBeUndefined();
  });
});

describe("consumeCode", () => {
  it("hands back what was issued, once", async () => {
    const raw = await issueCode(env, input);
    const consumed = await consumeCode(env, raw);
    expect(consumed.kind).toBe("valid");
    if (consumed.kind !== "valid") return;
    expect(consumed.code).toMatchObject({
      client_id: "notes",
      user_id: "user-1",
      redirect_uri: input.redirectUri,
      code_challenge: input.codeChallenge,
      nonce: "n-0S6",
    });
    expect(JSON.parse(consumed.code.scopes)).toEqual(["openid", "email"]);
  });

  it("names a second presentation as a replay, with whose code it was", async () => {
    const raw = await issueCode(env, input);
    await consumeCode(env, raw);
    const again = await consumeCode(env, raw);
    expect(again.kind).toBe("replayed");
    if (again.kind !== "replayed") return;
    expect(again.code).toMatchObject({
      client_id: "notes",
      user_id: "user-1",
    });
  });

  it("refuses an expired code without calling it a replay", async () => {
    const raw = await issueCode(env, input);
    const later = Date.now() + 61_000;
    expect((await consumeCode(env, raw, later)).kind).toBe("unknown");
  });

  it("refuses a code it never issued", async () => {
    expect((await consumeCode(env, "invented")).kind).toBe("unknown");
  });
});
