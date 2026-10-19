import type { Env } from "../env";
import { hashToken, randomToken } from "../lib/crypto";

const CODE_TTL_MS = 60_000;
const REPLAY_MEMORY_MS = 60 * 60 * 1000;

export interface CodeInput {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  nonce: string | null;
  scopes: string[];
  sessionId: string | null;
}

interface CodeRecord {
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  nonce: string | null;
  scopes: string;
  expires_at: string;
  session_id: string | null;
}

export type ConsumedCode =
  | { kind: "valid"; code: CodeRecord }
  | { kind: "replayed"; code: CodeRecord }
  | { kind: "unknown" };

const COLUMNS =
  "client_id, user_id, redirect_uri, code_challenge, nonce, scopes, expires_at, session_id";

export async function issueCode(env: Env, input: CodeInput): Promise<string> {
  const raw = randomToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM oauth_codes WHERE expires_at < ?`).bind(
      new Date(now - REPLAY_MEMORY_MS).toISOString(),
    ),
    env.DB.prepare(
      `INSERT INTO oauth_codes
       (code_hash, client_id, user_id, redirect_uri, code_challenge, nonce,
        scopes, expires_at, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      await hashToken(raw),
      input.clientId,
      input.userId,
      input.redirectUri,
      input.codeChallenge,
      input.nonce,
      JSON.stringify(input.scopes),
      new Date(now + CODE_TTL_MS).toISOString(),
      input.sessionId,
    ),
  ]);
  return raw;
}

export async function consumeCode(
  env: Env,
  raw: string,
  now: number = Date.now(),
): Promise<ConsumedCode> {
  const hash = await hashToken(raw);
  const claimed = await env.DB.prepare(
    `UPDATE oauth_codes SET used_at = ?
     WHERE code_hash = ? AND used_at IS NULL
     RETURNING ${COLUMNS}`,
  )
    .bind(new Date(now).toISOString(), hash)
    .first<CodeRecord>();
  if (claimed) {
    return Date.parse(claimed.expires_at) > now
      ? { kind: "valid", code: claimed }
      : { kind: "unknown" };
  }
  const used = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM oauth_codes WHERE code_hash = ? LIMIT 1`,
  )
    .bind(hash)
    .first<CodeRecord>();
  return used ? { kind: "replayed", code: used } : { kind: "unknown" };
}
