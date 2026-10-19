import type { Env } from "../env";
import { sessionById } from "../lib/session";
import { findClaimsUser, firstPartyClaims } from "./claims";
import { findClient } from "./clients";
import { mintAccessToken, verifyAccessToken } from "./tokens";

export async function renewAccessToken(
  env: Env,
  token: string,
): Promise<string | null> {
  const claims = await verifyAccessToken(env, token, env.PUBLIC_ORIGIN, 0);
  if (!claims?.client_id || typeof claims.sid !== "string") return null;
  const client = await findClient(env, claims.client_id);
  if (!client?.firstParty) return null;
  const session = await sessionById(env, claims.sid);
  if (session?.identity.id !== claims.sub) return null;
  const user = await findClaimsUser(env, claims.sub);
  if (!user) return null;
  const scopes = claims.scope.split(" ").filter(Boolean);
  return mintAccessToken(env, {
    audience: [client.id, env.PUBLIC_ORIGIN],
    sub: claims.sub,
    scopes,
    clientId: client.id,
    identity: firstPartyClaims(user, scopes, claims.sid),
  });
}
