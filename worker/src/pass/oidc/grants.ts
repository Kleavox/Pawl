import type { Env } from "../env";
import { hashToken, randomToken } from "../lib/crypto";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Grant {
  id: string;
  userId: string;
  clientId: string;
  subject: string;
  scopes: string[];
}

interface GrantRow {
  id: string;
  user_id: string;
  client_id: string;
  subject: string;
  scopes: string;
  revoked_at: string | null;
}

export type RotatedRefresh =
  { kind: "rotated"; raw: string; grant: Grant } | { kind: "rejected" };

const GRANT_COLUMNS = "id, user_id, client_id, subject, scopes, revoked_at";

function toGrant(row: GrantRow): Grant {
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    subject: row.subject,
    scopes: JSON.parse(row.scopes) as string[],
  };
}

async function grantRow(
  env: Env,
  userId: string,
  clientId: string,
): Promise<GrantRow | null> {
  return env.DB.prepare(
    `SELECT ${GRANT_COLUMNS}
     FROM oauth_grants WHERE user_id = ? AND client_id = ? LIMIT 1`,
  )
    .bind(userId, clientId)
    .first<GrantRow>();
}

export async function findGrant(
  env: Env,
  userId: string,
  clientId: string,
): Promise<Grant | null> {
  const row = await grantRow(env, userId, clientId);
  return row && row.revoked_at === null ? toGrant(row) : null;
}

export async function findGrantBySubject(
  env: Env,
  clientId: string,
  subject: string,
): Promise<Grant | null> {
  const row = await env.DB.prepare(
    `SELECT ${GRANT_COLUMNS}
     FROM oauth_grants
     WHERE client_id = ? AND subject = ? AND revoked_at IS NULL
     LIMIT 1`,
  )
    .bind(clientId, subject)
    .first<GrantRow>();
  return row ? toGrant(row) : null;
}

export async function recordGrant(
  env: Env,
  userId: string,
  clientId: string,
  subject: string,
  scopes: string[],
): Promise<Grant> {
  const existing = await grantRow(env, userId, clientId);
  if (!existing) {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO oauth_grants (id, user_id, client_id, subject, scopes)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(id, userId, clientId, subject, JSON.stringify(scopes))
      .run();
    return { id, userId, clientId, subject, scopes };
  }
  const kept =
    existing.revoked_at === null
      ? [...new Set([...toGrant(existing).scopes, ...scopes])]
      : scopes;
  await env.DB.prepare(
    `UPDATE oauth_grants SET subject = ?, scopes = ?, revoked_at = NULL
     WHERE id = ?`,
  )
    .bind(subject, JSON.stringify(kept), existing.id)
    .run();
  return { id: existing.id, userId, clientId, subject, scopes: kept };
}

export async function revokeGrant(env: Env, grantId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE oauth_grants SET revoked_at = datetime('now')
       WHERE id = ? AND revoked_at IS NULL`,
    ).bind(grantId),
    env.DB.prepare(`DELETE FROM oauth_refresh_tokens WHERE grant_id = ?`).bind(
      grantId,
    ),
  ]);
}

export async function revokeGrantFor(
  env: Env,
  userId: string,
  clientId: string,
): Promise<void> {
  const row = await grantRow(env, userId, clientId);
  if (row) await revokeGrant(env, row.id);
}

export async function issueRefreshToken(
  env: Env,
  grantId: string,
  now: number = Date.now(),
): Promise<string> {
  const raw = randomToken();
  await env.DB.prepare(
    `INSERT INTO oauth_refresh_tokens (token_hash, grant_id, expires_at)
     VALUES (?, ?, ?)`,
  )
    .bind(
      await hashToken(raw),
      grantId,
      new Date(now + REFRESH_TTL_MS).toISOString(),
    )
    .run();
  return raw;
}

export async function grantIdForRefreshToken(
  env: Env,
  raw: string,
  clientId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT g.id FROM oauth_refresh_tokens r
     JOIN oauth_grants g ON g.id = r.grant_id
     WHERE r.token_hash = ? AND g.client_id = ?
     LIMIT 1`,
  )
    .bind(await hashToken(raw), clientId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function rotateRefreshToken(
  env: Env,
  raw: string,
  clientId: string,
  now: number = Date.now(),
): Promise<RotatedRefresh> {
  const hash = await hashToken(raw);
  const row = await env.DB.prepare(
    `SELECT r.expires_at, r.replaced_by,
            g.id, g.user_id, g.client_id, g.subject, g.scopes, g.revoked_at
     FROM oauth_refresh_tokens r
     JOIN oauth_grants g ON g.id = r.grant_id
     WHERE r.token_hash = ?
     LIMIT 1`,
  )
    .bind(hash)
    .first<GrantRow & { expires_at: string; replaced_by: string | null }>();
  if (!row || row.client_id !== clientId) return { kind: "rejected" };
  if (row.replaced_by !== null) {
    await revokeGrant(env, row.id);
    return { kind: "rejected" };
  }
  if (row.revoked_at !== null || Date.parse(row.expires_at) <= now) {
    return { kind: "rejected" };
  }

  const next = randomToken();
  const nextHash = await hashToken(next);
  const claimed = await env.DB.prepare(
    `UPDATE oauth_refresh_tokens SET replaced_by = ?
     WHERE token_hash = ? AND replaced_by IS NULL
     RETURNING token_hash`,
  )
    .bind(nextHash, hash)
    .first<{ token_hash: string }>();
  if (!claimed) {
    await revokeGrant(env, row.id);
    return { kind: "rejected" };
  }
  await env.DB.prepare(
    `INSERT INTO oauth_refresh_tokens (token_hash, grant_id, expires_at)
     VALUES (?, ?, ?)`,
  )
    .bind(nextHash, row.id, new Date(now + REFRESH_TTL_MS).toISOString())
    .run();
  return { kind: "rotated", raw: next, grant: toGrant(row) };
}
