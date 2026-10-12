import type { PublicJwk } from "@pawl/oidc";

export class IdentityUnavailable extends Error {
  constructor(cause: string) {
    super(`Pawl's signing keys could not be read: ${cause}`);
    this.name = "IdentityUnavailable";
  }
}

export interface Keyring {
  keyFor(kid: string): Promise<PublicJwk | null>;
}

interface KeyFetcher {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

const KEYS_URL = "http://pass.internal/oauth/jwks.json";
const FRESH_MS = 60 * 60 * 1000;
const REFETCH_GAP_MS = 60 * 1000;

const keyrings = new WeakMap<KeyFetcher, Keyring>();

async function load(fetcher: KeyFetcher): Promise<Map<string, PublicJwk>> {
  let response: Response;
  try {
    response = await fetcher.fetch(KEYS_URL);
  } catch (cause) {
    throw new IdentityUnavailable(String(cause));
  }
  if (!response.ok) throw new IdentityUnavailable(`HTTP ${response.status}`);
  const body = (await response.json().catch(() => null)) as {
    keys?: unknown;
  } | null;
  if (!body || !Array.isArray(body.keys)) {
    throw new IdentityUnavailable("the key set has no keys");
  }
  return new Map(
    (body.keys as PublicJwk[])
      .filter((key) => typeof key?.kid === "string")
      .map((key) => [key.kid, key]),
  );
}

export function keyringFor(fetcher: KeyFetcher): Keyring {
  const known = keyrings.get(fetcher);
  if (known) return known;
  let keys: Map<string, PublicJwk> | null = null;
  let fetchedAt = 0;
  let refetchedAt = 0;
  const keyring: Keyring = {
    async keyFor(kid) {
      if (!keys || Date.now() - fetchedAt > FRESH_MS) {
        keys = await load(fetcher);
        fetchedAt = Date.now();
      }
      const key = keys.get(kid);
      if (key) return key;
      if (Date.now() - refetchedAt < REFETCH_GAP_MS) return null;
      refetchedAt = Date.now();
      keys = await load(fetcher);
      fetchedAt = refetchedAt;
      return keys.get(kid) ?? null;
    },
  };
  keyrings.set(fetcher, keyring);
  return keyring;
}
