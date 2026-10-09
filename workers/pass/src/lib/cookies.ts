import { SESSION_COOKIE, VERIFICATION_COOKIE } from "@pawl/auth";
import type { Env } from "../env";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export const VERIFICATION_TTL_SECONDS = {
  basic: 60 * 60 * 24,
  fresh: 60 * 30,
} as const;

export function makeSessionCookie(
  request: Request,
  env: Env,
  token: string,
): string {
  return serializeCookie(
    request,
    env,
    SESSION_COOKIE,
    token,
    SESSION_TTL_SECONDS,
  );
}

export function clearSessionCookie(request: Request, env: Env): string {
  return serializeCookie(request, env, SESSION_COOKIE, "", 0);
}

export function makeVerificationCookie(
  request: Request,
  env: Env,
  token: string,
  maxAge: number,
): string {
  return serializeCookie(request, env, VERIFICATION_COOKIE, token, maxAge);
}

function serializeCookie(
  request: Request,
  env: Env,
  name: string,
  value: string,
  maxAge: number,
): string {
  const host = new URL(request.url).hostname.toLowerCase();
  const rootDomain = env.ROOT_DOMAIN.toLowerCase();
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];

  if (host === rootDomain || host.endsWith(`.${rootDomain}`)) {
    attributes.push(`Domain=.${rootDomain}`);
  }

  return attributes.join("; ");
}
