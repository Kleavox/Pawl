import type { Env } from "../env";

export interface ClaimsUser {
  id: string;
  email: string;
  username: string | null;
  email_verified_at: string | null;
  role: "ADMIN" | "USER";
}

export function claimsFor(
  user: ClaimsUser,
  scopes: string[],
): Record<string, string | boolean> {
  const claims: Record<string, string | boolean> = {};
  if (scopes.includes("email") && user.email_verified_at !== null) {
    claims.email = user.email;
    claims.email_verified = true;
  }
  if (scopes.includes("profile") && user.username) {
    claims.preferred_username = user.username;
  }
  return claims;
}

export async function findClaimsUser(
  env: Env,
  userId: string,
): Promise<ClaimsUser | null> {
  return env.DB.prepare(
    `SELECT id, email, username, email_verified_at, role
     FROM users WHERE id = ? AND disabled_at IS NULL LIMIT 1`,
  )
    .bind(userId)
    .first<ClaimsUser>();
}
