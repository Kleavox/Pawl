import { createHash } from "node:crypto";

export interface ClientRegistration {
  id: string;
  name: string;
  redirectUris: string[];
  firstParty: boolean;
  confidential: boolean;
  scopes: string[];
  sector?: string;
}

const OFFERED_SCOPES = ["openid", "email", "profile"];
const CLIENT_ID = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

function quoted(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function checkedRedirect(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Redirect URI is not a URL: ${value}`);
  }
  if (value.includes("*")) {
    throw new Error(`Redirect URI may not contain a wildcard: ${value}`);
  }
  if (url.hash) {
    throw new Error(`Redirect URI may not carry a fragment: ${value}`);
  }
  const loopback = url.protocol === "http:" && LOOPBACK.has(url.hostname);
  if (url.protocol !== "https:" && !loopback) {
    throw new Error(`Redirect URI must be https: ${value}`);
  }
  return url;
}

export function prepareClient(
  input: ClientRegistration,
  secret: string | null,
): { sql: string } {
  if (!CLIENT_ID.test(input.id)) {
    throw new Error(`Client id must be a lowercase slug: ${input.id}`);
  }
  const name = input.name.trim();
  if (name.length === 0 || name.length > 64 || /\p{Cc}/u.test(name)) {
    throw new Error("Client name must be 1 to 64 printable characters.");
  }
  if (input.redirectUris.length === 0) {
    throw new Error("A client needs at least one redirect URI.");
  }
  const redirects = input.redirectUris.map(checkedRedirect);
  if (!input.scopes.includes("openid")) {
    throw new Error("A client must ask for the openid scope.");
  }
  const unknown = input.scopes.filter(
    (scope) => !OFFERED_SCOPES.includes(scope),
  );
  if (unknown.length > 0) {
    throw new Error(`Pawl offers no such scope: ${unknown.join(", ")}`);
  }
  if (input.confidential && !secret) {
    throw new Error("A confidential client needs a secret.");
  }
  if (!input.confidential && secret) {
    throw new Error("A public client must not be given a secret.");
  }

  const secretHash = secret
    ? quoted(createHash("sha256").update(secret).digest("base64url"))
    : "NULL";
  const sector = input.sector ?? redirects[0]?.host ?? "";
  return {
    sql:
      "INSERT INTO oauth_clients (id, name, redirect_uris, allowed_scopes, " +
      "confidential, first_party, secret_hash, sector, approved_at) VALUES (" +
      [
        quoted(input.id),
        quoted(name),
        quoted(JSON.stringify(input.redirectUris)),
        quoted(JSON.stringify(input.scopes)),
        input.confidential ? "1" : "0",
        input.firstParty ? "1" : "0",
        secretHash,
        quoted(sector),
        "datetime('now')",
      ].join(", ") +
      ")",
  };
}
