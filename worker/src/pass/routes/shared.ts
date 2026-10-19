import type { Identity } from "@pawl/core";
import {
  accountCredentialRequestSchema,
  accountDeleteRequestSchema,
  accountSetupRequestSchema,
  accountUpdateRequestSchema,
  challengeRequestSchema,
  emailActionRequestSchema,
  loginRequestSchema,
  oauthLinkRequestSchema,
  preloginRequestSchema,
  registerRequestSchema,
  resetCredentialRequestSchema,
  tokenActionRequestSchema,
} from "@pawl/protocol";
import type { Context, Hono } from "hono";
import { z, type ZodError } from "zod";

import type { Env } from "../env";
import { writeAuditEvent } from "../lib/audit";
import { hashToken, randomToken } from "../lib/crypto";
import type { OAuthProfile, OAuthProvider } from "../lib/oauth";
import { getSession, readSessionToken } from "../lib/session";

export type AppEnv = { Bindings: Env };
export type AppContext = Context<AppEnv>;
export type PassApp = Hono<AppEnv>;

interface UserRow {
  id: string;
  email: string;
  username: string | null;
  role: "ADMIN" | "USER";
  email_verified_at: string | null;
  auth_version: number;
  disabled_at: string | null;
  identity_id: string | null;
  password_hash: string | null;
}

export interface VerificationRecord {
  scope: "basic" | "fresh";
  issuedAt: number;
  expiresAt: number;
  ip: string;
}

export interface TokenRow {
  id: string;
  user_id: string;
  email: string;
  username: string | null;
  expires_at: string;
  auth_version: number;
}

export const EMAIL_VERIFICATION_TTL_MS = 30 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
export const OAUTH_LINK_TTL_SECONDS = 15 * 60;

export const registerSchema = registerRequestSchema;
export const preloginSchema = preloginRequestSchema;
export const loginSchema = loginRequestSchema;
export const emailActionSchema = emailActionRequestSchema;
export const otpStartSchema = emailActionRequestSchema;
export const otpVerifySchema = z
  .object({
    email: emailActionRequestSchema.shape.email,
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit code."),
  })
  .strict();
export const tokenActionSchema = tokenActionRequestSchema;
export const resetPasswordSchema = resetCredentialRequestSchema;
export const challengeSchema = challengeRequestSchema;
export const accountUpdateSchema = accountUpdateRequestSchema;
export const accountSetupSchema = accountSetupRequestSchema;
export const oauthLinkSchema = oauthLinkRequestSchema;
export const accountPasswordSchema = accountCredentialRequestSchema;
export const accountDeleteSchema = accountDeleteRequestSchema;

export function apiError(
  context: AppContext,
  status: 400 | 401 | 403 | 404 | 409 | 415 | 429 | 500 | 502 | 503,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return context.json({ code, message, ...extra }, status);
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "local";
}

export function sessionClient(request: Request) {
  return {
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("cf-connecting-ip"),
  };
}

export async function usernameTakenBy(
  env: Env,
  username: string,
  excludingUserId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1`,
  )
    .bind(username, excludingUserId)
    .first<{ id: string }>();
  return row !== null;
}

export async function currentSession(context: AppContext) {
  const token = readSessionToken(context.req.raw);
  return token ? await getSession(context.env, token) : null;
}

export async function checkVerification(
  env: Env,
  token: string | null,
  scope: "basic" | "fresh",
): Promise<boolean> {
  if (!token) return false;

  const record = await env.SESSIONS.get<VerificationRecord>(
    `verification:${await hashToken(token)}`,
    "json",
  );
  if (!record || record.expiresAt <= Date.now()) return false;

  return record.scope === "fresh" || record.scope === scope;
}

export function toIdentity(user: UserRow): Identity {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  };
}

export async function findUserByEmail(
  env: Env,
  email: string,
): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT u.id, u.email, u.username, u.role, u.email_verified_at,
            u.auth_version, u.disabled_at, i.id AS identity_id,
            i.password_hash
     FROM users u
     LEFT JOIN identities i
       ON i.user_id = u.id AND i.provider = 'password'
     WHERE lower(u.email) = ?
     LIMIT 1`,
  )
    .bind(email)
    .first<UserRow>();
}

type OAuthResolution =
  | { kind: "user"; user: UserRow }
  | { kind: "link_required"; existing: UserRow };

export async function resolveOAuthUser(
  env: Env,
  profile: OAuthProfile,
): Promise<OAuthResolution> {
  const linked = await env.DB.prepare(
    `SELECT u.id, u.email, u.username, u.role, u.email_verified_at,
            u.auth_version, u.disabled_at, i.id AS identity_id,
            i.password_hash
     FROM identities i
     JOIN users u ON u.id = i.user_id
     WHERE i.provider = ? AND i.provider_subject = ?
     LIMIT 1`,
  )
    .bind(profile.provider, profile.subject)
    .first<UserRow>();
  if (linked) return { kind: "user", user: linked };

  const existing = await findUserByEmail(env, profile.email);
  if (existing) {
    return { kind: "link_required", existing };
  }

  const userId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, email, email_verified_at)
       VALUES (?, ?, datetime('now'))`,
    ).bind(userId, profile.email),
    env.DB.prepare(
      `INSERT INTO identities
       (id, user_id, provider, provider_subject, password_hash)
       VALUES (?, ?, ?, ?, NULL)`,
    ).bind(identityId, userId, profile.provider, profile.subject),
  ]);

  return {
    kind: "user",
    user: {
      id: userId,
      email: profile.email,
      username: null,
      role: "USER",
      email_verified_at: new Date().toISOString(),
      auth_version: 1,
      disabled_at: null,
      identity_id: identityId,
      password_hash: null,
    },
  };
}

export function oauthProvider(value: string): OAuthProvider | null {
  return value === "google" || value === "github" ? value : null;
}

export async function createVerificationToken(
  _purpose: "EMAIL" | "PASSWORD_RESET",
  ttlMs: number,
): Promise<{ id: string; raw: string; hash: string; expiresAt: string }> {
  const raw = randomToken();
  return {
    id: crypto.randomUUID(),
    raw,
    hash: await hashToken(raw),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  };
}

export function firstIssue(error: ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

export function genericEmailResponse(context: AppContext) {
  return context.json({
    ok: true,
    message: "If the account is eligible, an email has been sent.",
  });
}

export function rateLimitError(context: AppContext, retryAfter: number) {
  context.header("Retry-After", retryAfter.toString());
  return apiError(
    context,
    429,
    "rate_limited",
    "Too many requests. Try again later.",
  );
}

export async function safeAudit(
  env: Env,
  event: Parameters<typeof writeAuditEvent>[1],
): Promise<void> {
  try {
    await writeAuditEvent(env, event);
  } catch (cause) {
    console.error("[pass audit]", cause);
  }
}
