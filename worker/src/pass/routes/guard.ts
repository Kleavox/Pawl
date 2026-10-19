import { readCookie, VERIFICATION_COOKIE } from "@pawl/auth";
import { encodeBase64Url } from "@pawl/crypto";

import type { Env } from "../env";
import { hashToken } from "../lib/crypto";
import {
  apiError,
  checkVerification,
  clientIp,
  rateLimitError,
  type AppContext,
} from "./shared";

const DEVICE_COOKIE = "__Host-pawl_device";
const DEVICE_ACCOUNTS = 3;
const DEVICE_SECONDS = 60 * 60 * 24 * 365;
const FLAGGED_MS = 15 * 60 * 1000;
const FLAGGED_LIMIT = 1000;
const EDGE_WINDOW_SECONDS = 60;

const flagged = new Map<string, number>();
const encoder = new TextEncoder();

function fingerprintOf(request: Request): string {
  const cf = request.cf as
    | { tlsClientCiphersSha1?: string; tlsClientExtensionsSha1?: string }
    | undefined;
  return `${cf?.tlsClientCiphersSha1 ?? ""}.${cf?.tlsClientExtensionsSha1 ?? ""}`;
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", imported, encoder.encode(data)),
  );
}

async function deviceTag(env: Env, email: string): Promise<string | null> {
  if (!env.OIDC_SUB_SECRET) return null;
  const key = await hmac(encoder.encode(env.OIDC_SUB_SECRET), "pawl/device/v1");
  const tag = await hmac(key, email.trim().toLowerCase());
  return encodeBase64Url(tag.slice(0, 16));
}

function deviceTags(request: Request): string[] {
  return (readCookie(request, DEVICE_COOKIE) ?? "").split(".").filter(Boolean);
}

async function knownDevice(
  request: Request,
  env: Env,
  email: string,
): Promise<boolean> {
  const tag = await deviceTag(env, email);
  return tag !== null && deviceTags(request).includes(tag);
}

export async function rememberDevice(
  context: AppContext,
  email: string,
): Promise<void> {
  const tag = await deviceTag(context.env, email);
  if (tag === null) return;
  const tags = [
    tag,
    ...deviceTags(context.req.raw).filter((each) => each !== tag),
  ].slice(0, DEVICE_ACCOUNTS);
  context.header(
    "Set-Cookie",
    `${DEVICE_COOKIE}=${tags.join(".")}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DEVICE_SECONDS}`,
    { append: true },
  );
}

export async function edgeLimited(
  context: AppContext,
  route: string,
  email: string | null,
): Promise<Response | null> {
  const limiter = context.env.SIGNIN_RATE_LIMIT;
  if (!limiter) return null;
  const keys = [`ip:${route}:${clientIp(context.req.raw)}`];
  if (email !== null) keys.push(`email:${route}:${await hashToken(email)}`);
  for (const key of keys) {
    if (!(await limiter.limit({ key })).success) {
      return rateLimitError(context, EDGE_WINDOW_SECONDS);
    }
  }
  return null;
}

export async function guardSignIn(
  context: AppContext,
  route: string,
  email: string,
): Promise<Response | null> {
  const limited = await edgeLimited(context, route, email);
  if (limited) return limited;
  const { env } = context;
  const request = context.req.raw;
  if (await knownDevice(request, env, email)) return null;
  const fingerprint = fingerprintOf(request);
  const suspicious =
    (flagged.get(fingerprint) ?? 0) > Date.now() ||
    (env.SIGNIN_TRY_LIMIT !== undefined &&
      !(await env.SIGNIN_TRY_LIMIT.limit({ key: fingerprint })).success);
  if (!suspicious) return null;
  if (
    await checkVerification(
      env,
      readCookie(request, VERIFICATION_COOKIE),
      "basic",
    )
  ) {
    return null;
  }
  return apiError(
    context,
    403,
    "challenge_required",
    "Confirm you are human, then try again.",
  );
}

export async function noteFailedSignIn(
  context: AppContext,
  email: string,
): Promise<void> {
  const { env } = context;
  const request = context.req.raw;
  if (!env.SIGNIN_FAILURE_LIMIT || (await knownDevice(request, env, email))) {
    return;
  }
  const fingerprint = fingerprintOf(request);
  if ((await env.SIGNIN_FAILURE_LIMIT.limit({ key: fingerprint })).success) {
    return;
  }
  if (flagged.size >= FLAGGED_LIMIT) flagged.clear();
  flagged.set(fingerprint, Date.now() + FLAGGED_MS);
}
