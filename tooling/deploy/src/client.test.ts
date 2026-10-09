import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { prepareClient, type ClientRegistration } from "./client";

const access: ClientRegistration = {
  id: "krynodes-access",
  name: "Krynodes",
  redirectUris: ["https://team.cloudflareaccess.com/cdn-cgi/access/callback"],
  firstParty: false,
  confidential: true,
  scopes: ["openid", "email", "profile"],
};

describe("prepareClient", () => {
  it("stores the hash of a confidential client's secret, never the secret", () => {
    const { sql } = prepareClient(access, "the-secret");
    const hash = createHash("sha256").update("the-secret").digest("base64url");
    expect(sql).toContain(`'${hash}'`);
    expect(sql).not.toContain("the-secret");
  });

  it("derives the pairwise sector from the redirect host", () => {
    expect(prepareClient(access, "s").sql).toContain(
      "'team.cloudflareaccess.com'",
    );
  });

  it("registers the client approved and with its flags", () => {
    const { sql } = prepareClient(access, "s");
    expect(sql).toMatch(/^INSERT INTO oauth_clients/u);
    expect(sql).toContain("datetime('now')");
    expect(sql).toContain(JSON.stringify(access.redirectUris));
  });

  it("escapes a quote in the name rather than ending the statement", () => {
    const { sql } = prepareClient({ ...access, name: "Owner's app" }, "s");
    expect(sql).toContain("'Owner''s app'");
  });

  it("refuses a confidential client with no secret", () => {
    expect(() => prepareClient(access, null)).toThrow(/secret/u);
  });

  it("refuses a public client that was handed a secret", () => {
    expect(() =>
      prepareClient({ ...access, confidential: false }, "s"),
    ).toThrow(/secret/u);
  });

  it("refuses a redirect uri that is not https", () => {
    expect(() =>
      prepareClient({ ...access, redirectUris: ["http://app.test/cb"] }, "s"),
    ).toThrow(/https/u);
  });

  it("allows plain http only on the loopback, for local development", () => {
    expect(() =>
      prepareClient(
        { ...access, redirectUris: ["http://127.0.0.1:8788/callback"] },
        "s",
      ),
    ).not.toThrow();
  });

  it("refuses a wildcard or a fragment in a redirect uri", () => {
    for (const uri of [
      "https://*.app.test/cb",
      "https://app.test/cb#done",
      "not a url",
    ]) {
      expect(() =>
        prepareClient({ ...access, redirectUris: [uri] }, "s"),
      ).toThrow();
    }
  });

  it("refuses a scope the provider does not offer, or a client without openid", () => {
    expect(() =>
      prepareClient({ ...access, scopes: ["openid", "admin"] }, "s"),
    ).toThrow(/scope/u);
    expect(() => prepareClient({ ...access, scopes: ["email"] }, "s")).toThrow(
      /openid/u,
    );
  });

  it("refuses an id that is not a plain slug", () => {
    expect(() => prepareClient({ ...access, id: "x'; DROP" }, "s")).toThrow(
      /id/u,
    );
  });
});
