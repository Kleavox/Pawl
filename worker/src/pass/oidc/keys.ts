import { jwkOf, type PublicJwk } from "@pawl/oidc";

import type { Env } from "../env";

export type { PublicJwk };

export interface SigningKey {
  pkcs8: string;
  kid: string;
}

function configured(value: string | undefined): string {
  if (!value) throw new Error("OIDC_SIGNING_KEY is not configured");
  return value;
}

export async function loadSigningKey(env: Env): Promise<SigningKey> {
  const pkcs8 = configured(env.OIDC_SIGNING_KEY);
  return { pkcs8, kid: jwkOf(pkcs8).kid };
}

export async function publicJwks(env: Env): Promise<{ keys: PublicJwk[] }> {
  const keys = [jwkOf(configured(env.OIDC_SIGNING_KEY))];
  if (env.OIDC_PREVIOUS_SIGNING_KEY)
    keys.push(jwkOf(env.OIDC_PREVIOUS_SIGNING_KEY));
  return { keys };
}
