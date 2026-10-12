import type { Env } from "../env";
import { hashToken } from "./crypto";

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

export async function rateLimit(
  env: Env,
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `rate:${scope}:${await hashToken(subject)}:${bucket}`;
  const current = Number((await env.SESSIONS.get(key)) ?? "0");
  const elapsed = Math.floor(Date.now() / 1000) % windowSeconds;
  const retryAfter = Math.max(1, windowSeconds - elapsed);

  if (current >= limit) return { allowed: false, retryAfter };

  await env.SESSIONS.put(key, String(current + 1), {
    expirationTtl: Math.max(60, retryAfter + 5),
  });
  return { allowed: true, retryAfter };
}
