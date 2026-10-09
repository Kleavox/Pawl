import { describe, expect, it } from "vitest";

import type { Env } from "../env";
import { hashToken } from "../lib/crypto";
import {
  findClient,
  redirectUriAllowed,
  verifyClientSecret,
  type OidcClient,
} from "./clients";

const client: OidcClient = {
  id: "krynodes-access",
  name: "Krynodes",
  redirectUris: ["https://team.cloudflareaccess.com/cdn-cgi/access/callback"],
  allowedScopes: ["openid", "email", "profile"],
  confidential: true,
  firstParty: false,
  sector: "cloudflareaccess.com",
};

const registered = client.redirectUris[0] ?? "";

function dbReturning(row: Record<string, unknown> | null): Env {
  const seen: string[] = [];
  return {
    DB: {
      prepare: (sql: string) => {
        seen.push(sql);
        return {
          bind: () => ({ first: async () => row }),
        };
      },
    },
  } as unknown as Env;
}

describe("redirectUriAllowed", () => {
  it("accepts the registered value", () => {
    expect(redirectUriAllowed(client, registered)).toBe(true);
  });

  it("rejects a prefix of the registered value", () => {
    expect(
      redirectUriAllowed(
        client,
        "https://team.cloudflareaccess.com/cdn-cgi/access",
      ),
    ).toBe(false);
  });

  it("rejects an extended value", () => {
    expect(redirectUriAllowed(client, `${registered}/../../evil`)).toBe(false);
  });

  it("rejects a different host that merely contains the registered one", () => {
    expect(
      redirectUriAllowed(
        client,
        "https://team.cloudflareaccess.com.evil.test/cdn-cgi/access/callback",
      ),
    ).toBe(false);
  });

  it("rejects an empty value", () => {
    expect(redirectUriAllowed(client, "")).toBe(false);
  });
});

describe("findClient", () => {
  it("reads the registered row into a client", async () => {
    const found = await findClient(
      dbReturning({
        id: client.id,
        name: client.name,
        redirect_uris: JSON.stringify(client.redirectUris),
        allowed_scopes: JSON.stringify(client.allowedScopes),
        confidential: 1,
        first_party: 0,
        sector: client.sector,
      }),
      client.id,
    );
    expect(found).toEqual(client);
  });

  it("answers null for a client it cannot serve", async () => {
    expect(await findClient(dbReturning(null), "unknown")).toBeNull();
  });
});

describe("verifyClientSecret", () => {
  it("accepts the secret whose hash is stored", async () => {
    const env = dbReturning({ secret_hash: await hashToken("s3cret") });
    expect(await verifyClientSecret(env, client.id, "s3cret")).toBe(true);
  });

  it("rejects any other secret", async () => {
    const env = dbReturning({ secret_hash: await hashToken("s3cret") });
    expect(await verifyClientSecret(env, client.id, "guess")).toBe(false);
  });

  it("rejects every secret for a client that has none", async () => {
    const env = dbReturning({ secret_hash: null });
    expect(await verifyClientSecret(env, client.id, "")).toBe(false);
  });
});
