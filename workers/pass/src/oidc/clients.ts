import { timingSafeEqual } from "@pawl/crypto";

import type { Env } from "../env";
import { hashToken } from "../lib/crypto";

export interface OidcClient {
  id: string;
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  confidential: boolean;
  firstParty: boolean;
  sector: string;
}

interface ClientRow {
  id: string;
  name: string;
  redirect_uris: string;
  allowed_scopes: string;
  confidential: number;
  first_party: number;
  sector: string;
}

const SERVABLE = "approved_at IS NOT NULL AND disabled_at IS NULL";
const encoder = new TextEncoder();

export function redirectUriAllowed(client: OidcClient, uri: string): boolean {
  return uri.length > 0 && client.redirectUris.includes(uri);
}

export async function findClient(
  env: Env,
  id: string,
): Promise<OidcClient | null> {
  const row = await env.DB.prepare(
    `SELECT id, name, redirect_uris, allowed_scopes, confidential,
            first_party, sector
     FROM oauth_clients
     WHERE id = ? AND ${SERVABLE}
     LIMIT 1`,
  )
    .bind(id)
    .first<ClientRow>();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    redirectUris: JSON.parse(row.redirect_uris) as string[],
    allowedScopes: JSON.parse(row.allowed_scopes) as string[],
    confidential: row.confidential === 1,
    firstParty: row.first_party === 1,
    sector: row.sector,
  };
}

export async function verifyClientSecret(
  env: Env,
  id: string,
  secret: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT secret_hash FROM oauth_clients WHERE id = ? AND ${SERVABLE} LIMIT 1`,
  )
    .bind(id)
    .first<{ secret_hash: string | null }>();
  if (!row?.secret_hash) return false;
  return timingSafeEqual(
    encoder.encode(await hashToken(secret)),
    encoder.encode(row.secret_hash),
  );
}
