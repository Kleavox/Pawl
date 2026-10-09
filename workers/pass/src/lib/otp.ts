import type { Env } from "../env";
import { hashToken, verifyAuthVerifier } from "./crypto";

const TTL_MS = 600_000;
const MAX_ATTEMPTS = 5;

interface OtpRow {
  code_hash: string;
  attempts: number;
  expires_at: number;
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function secretFor(email: string, code: string): string {
  return `${normalize(email)}:${code}`;
}

async function keyFor(email: string): Promise<string> {
  return `otp:${await hashToken(normalize(email))}`;
}

export async function issueOtp(env: Env, email: string): Promise<string> {
  const digits = crypto.getRandomValues(new Uint32Array(1))[0]! % 1000000;
  const code = String(digits).padStart(6, "0");
  const now = Date.now();
  await env.DB.prepare(`DELETE FROM otp_codes WHERE expires_at <= ?`)
    .bind(now)
    .run();
  await env.DB.prepare(
    `INSERT INTO otp_codes (key, code_hash, attempts, expires_at)
     VALUES (?, ?, 0, ?)
     ON CONFLICT(key) DO UPDATE SET
       code_hash = excluded.code_hash,
       attempts = 0,
       expires_at = excluded.expires_at`,
  )
    .bind(
      await keyFor(email),
      await hashToken(secretFor(email, code)),
      now + TTL_MS,
    )
    .run();
  return code;
}

export interface OtpVerification {
  status: "ok" | "wrong" | "expired" | "exhausted";
  attemptsLeft?: number;
}

export async function verifyOtp(
  env: Env,
  email: string,
  code: string,
): Promise<OtpVerification> {
  const key = await keyFor(email);
  const row = await env.DB.prepare(
    `SELECT code_hash, attempts, expires_at FROM otp_codes WHERE key = ?`,
  )
    .bind(key)
    .first<OtpRow>();
  if (!row) return { status: "expired" };

  const lapsed = !(Date.now() < row.expires_at);
  if (lapsed) {
    await env.DB.prepare(`DELETE FROM otp_codes WHERE key = ?`).bind(key).run();
    return { status: "expired" };
  }
  if (row.attempts >= MAX_ATTEMPTS) return { status: "exhausted" };

  if (await verifyAuthVerifier(secretFor(email, code), row.code_hash)) {
    const consumed = await env.DB.prepare(
      `DELETE FROM otp_codes WHERE key = ? AND code_hash = ?`,
    )
      .bind(key, row.code_hash)
      .run();
    if (consumed.meta.changes !== 1) return { status: "expired" };
    return { status: "ok" };
  }

  const counted = await env.DB.prepare(
    `UPDATE otp_codes SET attempts = attempts + 1
     WHERE key = ? AND attempts < ?
     RETURNING attempts`,
  )
    .bind(key, MAX_ATTEMPTS)
    .first<{ attempts: number }>();
  if (!counted) return { status: "exhausted" };

  const attemptsLeft = MAX_ATTEMPTS - counted.attempts;
  return attemptsLeft <= 0
    ? { status: "exhausted" }
    : { status: "wrong", attemptsLeft };
}
