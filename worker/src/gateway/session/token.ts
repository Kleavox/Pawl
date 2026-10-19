import { verifiedClaims } from "@pawl/oidc";

import type { Keyring } from "./keys";

export interface TokenClaims {
  sub: string;
  exp: number;
  role?: "ADMIN" | "USER";
  email?: string;
  preferred_username?: string;
  nonce?: string;
  sid?: string;
}

export type Verified =
  | { kind: "valid"; claims: TokenClaims }
  | { kind: "expired" }
  | { kind: "invalid" };

export interface Expectation {
  issuer: string;
  audience: string;
  now: number;
}

const INVALID: Verified = { kind: "invalid" };

function kidOf(token: string): string | null {
  try {
    const header = JSON.parse(
      atob(
        (token.split(".")[0] ?? "").replaceAll("-", "+").replaceAll("_", "/"),
      ),
    ) as { kid?: unknown };
    return typeof header.kid === "string" ? header.kid : null;
  } catch {
    return null;
  }
}

export async function verifyToken(
  token: string,
  keyring: Keyring,
  expected: Expectation,
): Promise<Verified> {
  const kid = kidOf(token);
  if (!kid) return INVALID;
  const key = await keyring.keyFor(kid);
  if (!key) return INVALID;
  const claims = verifiedClaims(
    token,
    [key],
    expected.issuer,
    expected.audience,
    0,
  );
  if (
    !claims ||
    typeof claims.sub !== "string" ||
    typeof claims.exp !== "number"
  ) {
    return INVALID;
  }
  if (claims.exp * 1000 <= expected.now) return { kind: "expired" };
  return { kind: "valid", claims: claims as unknown as TokenClaims };
}
