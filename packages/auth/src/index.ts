import {
  INTERNAL_URLS,
  SESSION_COOKIE,
  VERIFICATION_COOKIE,
} from "@pawl/config";
import type { SessionIdentity } from "@pawl/core";

export { SESSION_COOKIE, VERIFICATION_COOKIE };
export { verifyTurnstile, type TurnstileEnv } from "./turnstile";

export type VerificationScope = "basic" | "fresh";

export interface PassBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;

    const key = pair.slice(0, separator).trim();
    if (key !== name) continue;

    return decodeURIComponent(pair.slice(separator + 1).trim());
  }

  return null;
}

export const STANDALONE_SESSION: SessionIdentity = {
  identity: {
    id: "standalone",
    email: "standalone@localhost",
    username: "standalone",
    role: "ADMIN",
  },
  sessionId: "standalone",
  expiresAt: "9999-12-31T23:59:59.000Z",
};

export function requirePassInProduction(env: {
  ENVIRONMENT?: string;
  PASS?: PassBinding;
}): void {
  if (env.ENVIRONMENT === "production" && !env.PASS) {
    throw new Error(
      "PASS binding is missing in production, so every session check would fall open",
    );
  }
}

export async function verifySession(
  request: Request,
  pass: PassBinding | undefined,
): Promise<SessionIdentity | null> {
  if (!pass) return STANDALONE_SESSION;

  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId) return null;

  const response = await pass.fetch(INTERNAL_URLS.SESSION_VERIFY, {
    headers: {
      "x-pawl-session": sessionId,
    },
  });

  if (!response.ok) return null;
  return response.json<SessionIdentity>();
}

export async function verifyChallenge(
  request: Request,
  pass: PassBinding | undefined,
  scope: VerificationScope,
): Promise<boolean> {
  if (!pass) return false;

  const token = readCookie(request, VERIFICATION_COOKIE);
  if (!token) return false;

  const url = new URL(INTERNAL_URLS.VERIFICATION_CHECK);
  url.searchParams.set("scope", scope);

  const response = await pass.fetch(url, {
    headers: {
      "x-pawl-verification": token,
    },
  });

  return response.ok;
}
