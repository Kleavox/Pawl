import { describe, expect, it } from "vitest";

import type { Env } from "../env";
import { claimsFor, findClaimsUser, type ClaimsUser } from "./claims";
import { migratedDb, seedUser } from "./db.testkit";

function userWith(overrides: Partial<ClaimsUser>): ClaimsUser {
  return {
    id: "user-1",
    email: "owner@product.test",
    username: "owner",
    email_verified_at: "2026-10-08T00:00:00.000Z",
    role: "USER",
    ...overrides,
  };
}

describe("claimsFor", () => {
  it("omits email entirely when the address is unverified", () => {
    const claims = claimsFor(userWith({ email_verified_at: null }), [
      "openid",
      "email",
    ]);
    expect(claims).not.toHaveProperty("email");
    expect(claims).not.toHaveProperty("email_verified");
  });

  it("never reports email_verified true for an unverified address", () => {
    const claims = claimsFor(userWith({ email_verified_at: null }), [
      "openid",
      "email",
    ]);
    expect(claims.email_verified).not.toBe(true);
  });

  it("emits email and email_verified true once verified", () => {
    expect(claimsFor(userWith({}), ["openid", "email"])).toEqual({
      email: "owner@product.test",
      email_verified: true,
    });
  });

  it("omits email when the email scope was not asked for", () => {
    expect(claimsFor(userWith({}), ["openid"])).not.toHaveProperty("email");
  });

  it("emits preferred_username only for the profile scope", () => {
    expect(claimsFor(userWith({}), ["openid"])).not.toHaveProperty(
      "preferred_username",
    );
    expect(claimsFor(userWith({}), ["openid", "profile"])).toEqual({
      preferred_username: "owner",
    });
  });

  it("omits preferred_username for an account that has not chosen one", () => {
    expect(
      claimsFor(userWith({ username: null }), ["openid", "profile"]),
    ).toEqual({});
  });
});

describe("findClaimsUser", () => {
  it("reads the account the claims describe", async () => {
    const db = migratedDb();
    seedUser(db, { id: "user-1", email: "owner@product.test", username: "o" });
    expect(await findClaimsUser({ DB: db.DB } as Env, "user-1")).toMatchObject({
      id: "user-1",
      email: "owner@product.test",
      username: "o",
    });
  });

  it("finds nobody for a disabled or deleted account", async () => {
    const db = migratedDb();
    seedUser(db, { id: "user-1", email: "owner@product.test" });
    db.sqlite
      .prepare("UPDATE users SET disabled_at = datetime('now') WHERE id = ?")
      .run("user-1");
    const env = { DB: db.DB } as Env;
    expect(await findClaimsUser(env, "user-1")).toBeNull();
    expect(await findClaimsUser(env, "gone")).toBeNull();
  });
});
