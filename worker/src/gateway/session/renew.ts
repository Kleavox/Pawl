import { readCookie } from "@pawl/auth";

import { keyringFor } from "./keys";
import { SESSION_COOKIE_NAME, type SessionEnv } from "./resolve";
import { verifyToken } from "./token";

const RENEW_URL = "http://pass.internal/internal/renew";

export type Renewal = { kind: "renewed"; token: string } | { kind: "ended" };

export async function renewalOf(
  request: Request,
  env: SessionEnv,
  evenIfLive: boolean,
): Promise<Renewal | null> {
  if (!env.PASS || !env.OIDC_ISSUER || !env.OIDC_CLIENT_ID) return null;
  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (!token) return null;
  const verified = await verifyToken(token, keyringFor(env.PASS), {
    issuer: env.OIDC_ISSUER,
    audience: env.OIDC_CLIENT_ID,
    now: Date.now(),
  });
  const due =
    verified.kind === "expired" ||
    (evenIfLive &&
      verified.kind === "valid" &&
      typeof verified.claims.sid === "string");
  if (!due) return null;
  const answer = await env.PASS.fetch(RENEW_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (answer.status === 401) return { kind: "ended" };
  if (!answer.ok) return null;
  const body = (await answer.json().catch(() => null)) as {
    access_token?: unknown;
  } | null;
  return typeof body?.access_token === "string"
    ? { kind: "renewed", token: body.access_token }
    : null;
}

export function withSessionToken(request: Request, token: string): Request {
  const others = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith(`${SESSION_COOKIE_NAME}=`));
  const headers = new Headers(request.headers);
  headers.set(
    "cookie",
    [...others, `${SESSION_COOKIE_NAME}=${token}`].join("; "),
  );
  return new Request(request, { headers });
}
