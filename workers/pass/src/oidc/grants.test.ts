import { beforeEach, describe, expect, it } from "vitest";

import type { Env } from "../env";
import { migratedDb, seedClient, seedUser, type TestDb } from "./db.testkit";
import {
  findGrant,
  findGrantBySubject,
  grantIdForRefreshToken,
  issueRefreshToken,
  recordGrant,
  revokeGrant,
  rotateRefreshToken,
} from "./grants";

const CLIENT = "krynodes-access";
const SUBJECT = "pairwise-1";

let db: TestDb;
let env: Env;

function grantFor(scopes: string[]) {
  return recordGrant(env, "user-1", CLIENT, SUBJECT, scopes);
}

beforeEach(() => {
  db = migratedDb();
  seedUser(db, { id: "user-1", email: "owner@product.test" });
  seedClient(db, {
    id: CLIENT,
    redirectUris: ["https://team.cloudflareaccess.com/cdn-cgi/access/callback"],
    firstParty: false,
  });
  seedClient(db, {
    id: "other",
    redirectUris: ["https://other.test/cb"],
    firstParty: false,
  });
  env = { DB: db.DB } as Env;
});

describe("grants", () => {
  it("records what the person agreed to", async () => {
    await grantFor(["openid", "email"]);
    expect(await findGrant(env, "user-1", CLIENT)).toMatchObject({
      userId: "user-1",
      clientId: CLIENT,
      scopes: ["openid", "email"],
    });
  });

  it("widens an existing grant rather than shrinking it on a narrower sign-in", async () => {
    await grantFor(["openid", "email"]);
    await grantFor(["openid", "profile"]);
    const grant = await findGrant(env, "user-1", CLIENT);
    expect(grant?.scopes.sort()).toEqual(["email", "openid", "profile"]);
  });

  it("forgets a revoked grant entirely", async () => {
    await revokeGrant(env, (await grantFor(["openid"])).id);
    expect(await findGrant(env, "user-1", CLIENT)).toBeNull();
  });

  it("starts a grant afresh after revocation, without the old scopes", async () => {
    await revokeGrant(env, (await grantFor(["openid", "email"])).id);
    await grantFor(["openid"]);
    expect((await findGrant(env, "user-1", CLIENT))?.scopes).toEqual([
      "openid",
    ]);
  });
});

describe("grants by subject", () => {
  it("find the live grant behind the sub a client was given", async () => {
    await grantFor(["openid"]);
    expect(await findGrantBySubject(env, CLIENT, SUBJECT)).toMatchObject({
      userId: "user-1",
      scopes: ["openid"],
    });
  });

  it("find nothing once the grant is revoked", async () => {
    await revokeGrant(env, (await grantFor(["openid"])).id);
    expect(await findGrantBySubject(env, CLIENT, SUBJECT)).toBeNull();
  });

  it("find nothing for the same sub under another client", async () => {
    await grantFor(["openid"]);
    expect(await findGrantBySubject(env, "other", SUBJECT)).toBeNull();
  });
});

describe("refresh tokens", () => {
  it("stores the hash of the token, never the token itself", async () => {
    const raw = await issueRefreshToken(env, (await grantFor(["openid"])).id);
    const stored = JSON.stringify(
      db.sqlite.prepare("SELECT * FROM oauth_refresh_tokens").all(),
    );
    expect(stored).not.toContain(raw);
  });

  it("rotate on use, and hand back the grant they belong to", async () => {
    const grant = await grantFor(["openid", "email"]);
    const first = await issueRefreshToken(env, grant.id);
    const rotated = await rotateRefreshToken(env, first, CLIENT);
    expect(rotated.kind).toBe("rotated");
    if (rotated.kind !== "rotated") return;
    expect(rotated.raw).not.toBe(first);
    expect(rotated.grant).toMatchObject({
      id: grant.id,
      userId: "user-1",
      subject: SUBJECT,
    });
  });

  it("revoke the whole grant when a retired token is replayed", async () => {
    const grant = await grantFor(["openid", "email"]);
    const first = await issueRefreshToken(env, grant.id);
    const rotated = await rotateRefreshToken(env, first, CLIENT);
    expect((await rotateRefreshToken(env, first, CLIENT)).kind).toBe(
      "rejected",
    );
    expect(await findGrant(env, "user-1", CLIENT)).toBeNull();
    if (rotated.kind !== "rotated") throw new Error("did not rotate");
    expect((await rotateRefreshToken(env, rotated.raw, CLIENT)).kind).toBe(
      "rejected",
    );
  });

  it("refuse a token presented by a client it was not issued to", async () => {
    const raw = await issueRefreshToken(env, (await grantFor(["openid"])).id);
    expect((await rotateRefreshToken(env, raw, "other")).kind).toBe("rejected");
  });

  it("refuse an expired token", async () => {
    const raw = await issueRefreshToken(env, (await grantFor(["openid"])).id);
    const later = Date.now() + 31 * 24 * 60 * 60 * 1000;
    expect((await rotateRefreshToken(env, raw, CLIENT, later)).kind).toBe(
      "rejected",
    );
  });

  it("die with the grant they belong to", async () => {
    const grant = await grantFor(["openid"]);
    const raw = await issueRefreshToken(env, grant.id);
    await revokeGrant(env, grant.id);
    expect((await rotateRefreshToken(env, raw, CLIENT)).kind).toBe("rejected");
  });

  it("name the grant they belong to, but only to the client holding them", async () => {
    const grant = await grantFor(["openid"]);
    const raw = await issueRefreshToken(env, grant.id);
    expect(await grantIdForRefreshToken(env, raw, CLIENT)).toBe(grant.id);
    expect(await grantIdForRefreshToken(env, raw, "other")).toBeNull();
    expect(await grantIdForRefreshToken(env, "invented", CLIENT)).toBeNull();
  });

  it("refuse a token nobody issued", async () => {
    expect((await rotateRefreshToken(env, "invented", CLIENT)).kind).toBe(
      "rejected",
    );
  });
});
