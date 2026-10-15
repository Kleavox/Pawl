import { EMPTY_MANIFEST, Registry, withOutsideApps } from "@pawl/registry";
import { beforeEach, describe, expect, it } from "vitest";

import type { Env } from "../env";
import { hashToken } from "../lib/crypto";
import { findClient, verifyClientSecret } from "./clients";
import { migratedDb, seedClient, type TestDb } from "./db.testkit";
import { recordGrant } from "./grants";
import {
  findOutsideApp,
  listOutsideApps,
  registerOutsideApp,
  removeOutsideApp,
  type NewOutsideApp,
} from "./outside";

const MANIFEST = JSON.stringify({
  site: { name: "Example" },
  apps: [
    {
      key: "docs",
      label: "docs",
      title: "Docs",
      subdomain: "docs",
      service: "docs",
    },
  ],
});

let db: TestDb;
let env: Env;

const DNS: NewOutsideApp = {
  title: "DNS",
  label: "dns",
  address: "https://enroll.elsewhere.test",
  returnTo: null,
  access: "visitor",
  card: true,
};

beforeEach(() => {
  db = migratedDb();
  env = { DB: db.DB, ESTATE_MANIFEST: MANIFEST } as unknown as Env;
});

describe("registering an outside app", () => {
  it("makes its third-party client and its bay in one step, and hands the secret back once", async () => {
    const result = await registerOutsideApp(env, DNS, "owner-1");
    if (result.kind !== "created") throw new Error(result.kind);
    expect(result.app).toMatchObject({
      key: "dns",
      label: "dns",
      title: "DNS",
      origin: "https://enroll.elsewhere.test",
      access: "visitor",
      card: true,
      clientId: "dns",
      redirectUri: "https://enroll.elsewhere.test/auth/callback",
    });
    const client = await findClient(env, "dns");
    expect(client).toMatchObject({
      firstParty: false,
      confidential: true,
      allowedScopes: ["openid", "email", "profile"],
      sector: "enroll.elsewhere.test",
      redirectUris: ["https://enroll.elsewhere.test/auth/callback"],
    });
    expect(await verifyClientSecret(env, "dns", result.secret)).toBe(true);
    const stored = db.sqlite
      .prepare("SELECT secret_hash FROM oauth_clients WHERE id = 'dns'")
      .get() as { secret_hash: string };
    expect(stored.secret_hash).toBe(await hashToken(result.secret));
    expect(JSON.stringify(stored)).not.toContain(result.secret);
  });

  it("keeps a return address an app behind Access needs, and takes its sector from it", async () => {
    const result = await registerOutsideApp(
      env,
      {
        ...DNS,
        returnTo: "https://team.cloudflareaccess.com/cdn-cgi/access/callback",
        card: false,
      },
      "owner-1",
    );
    if (result.kind !== "created") throw new Error(result.kind);
    expect((await findClient(env, "dns"))?.sector).toBe(
      "team.cloudflareaccess.com",
    );
  });

  it("puts the app beside the manifest's apps, so the registry places its bay", async () => {
    await registerOutsideApp(env, DNS, "owner-1");
    const merged = withOutsideApps(MANIFEST, await listOutsideApps(env));
    const view = new Registry(merged).publicView(
      "https://example.test",
      "https://paw.example.test",
    );
    expect(view.bays.find((bay) => bay.key === "dns")).toMatchObject({
      href: "https://enroll.elsewhere.test",
      card: true,
      access: "visitor",
    });
  });

  it("refuses what the cabinet or the provider could not hold, in plain words", async () => {
    const cases: [Partial<NewOutsideApp>, string][] = [
      [{ title: "" }, "name"],
      [{ title: "x".repeat(33) }, "name"],
      [{ label: "9dns" }, "label"],
      [{ label: "DNS" }, "label"],
      [{ label: "a-very-long-label" }, "label"],
      [{ address: "http://enroll.elsewhere.test" }, "address"],
      [{ address: "https://enroll.elsewhere.test/app" }, "address"],
      [{ address: "not an address" }, "address"],
      [{ returnTo: "https://enroll.elsewhere.test/cb#x" }, "return"],
      [{ returnTo: "http://enroll.elsewhere.test/cb" }, "return"],
    ];
    for (const [change, word] of cases) {
      const result = await registerOutsideApp(
        env,
        { ...DNS, ...change },
        "owner-1",
      );
      expect(result.kind, JSON.stringify(change)).toBe("invalid");
      if (result.kind === "invalid") {
        expect(result.message.toLowerCase()).toContain(word);
      }
    }
    expect(await listOutsideApps(env)).toEqual([]);
  });

  it("refuses a label the manifest already uses, an origin already registered, or a client id in use", async () => {
    expect(
      (await registerOutsideApp(env, { ...DNS, label: "docs" }, "o")).kind,
    ).toBe("invalid");
    await registerOutsideApp(env, DNS, "o");
    expect(
      (await registerOutsideApp(env, { ...DNS, label: "dns2" }, "o")).kind,
    ).toBe("invalid");
    seedClient(db, {
      id: "mail",
      redirectUris: ["https://mail.elsewhere.test/cb"],
      firstParty: false,
    });
    const taken = await registerOutsideApp(
      env,
      { ...DNS, label: "mail", address: "https://mail.elsewhere.test" },
      "o",
    );
    expect(taken.kind).toBe("invalid");
    expect(await listOutsideApps(env)).toHaveLength(1);
  });

  it("works without a manifest at all", async () => {
    const bare = { DB: db.DB } as unknown as Env;
    expect((await registerOutsideApp(bare, DNS, "o")).kind).toBe("created");
    expect(
      new Registry(withOutsideApps(EMPTY_MANIFEST, await listOutsideApps(bare)))
        .publicView("https://example.test", "https://paw.example.test")
        .bays.map((bay) => bay.key),
    ).toEqual(["dns"]);
  });
});

describe("removing an outside app", () => {
  it("removes its client, every grant and its bay at once", async () => {
    db.sqlite
      .prepare(
        "INSERT INTO users (id, email, email_verified_at) VALUES ('u1', 'u1@x.test', '2026-10-15')",
      )
      .run();
    await registerOutsideApp(env, DNS, "o");
    await recordGrant(env, "u1", "dns", "pairwise", ["openid"]);
    expect(await removeOutsideApp(env, "dns")).toBe(true);
    expect(await findOutsideApp(env, "dns")).toBeNull();
    expect(await findClient(env, "dns")).toBeNull();
    expect(
      db.sqlite.prepare("SELECT COUNT(*) AS n FROM oauth_grants").get(),
    ).toEqual({ n: 0 });
    expect(await removeOutsideApp(env, "dns")).toBe(false);
  });
});
