export const ISSUER = "http://127.0.0.1:8787";
export const CLIENT_ID = "gateway";
export const CLIENT_SECRET = "gateway-secret";

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function segment(value: unknown): string {
  return base64Url(encoder.encode(JSON.stringify(value)));
}

export interface FakePawl {
  fetch(input: string | Request, init?: RequestInit): Promise<Response>;
  sign(claims: Record<string, unknown>, kid?: string): Promise<string>;
  jwksFetches: number;
  keysDown: boolean;
  tokenRequests: URLSearchParams[];
  tokenHeaders: Headers[];
  answerToken: (form: URLSearchParams) => Promise<Response>;
  sharedSession: unknown;
  devices: Record<string, number>;
}

export async function fakePawl(): Promise<FakePawl> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey(
    "jwk",
    pair.publicKey,
  )) as JsonWebKey;
  const pawl: FakePawl = {
    jwksFetches: 0,
    keysDown: false,
    tokenRequests: [],
    tokenHeaders: [],
    sharedSession: null,
    devices: {},
    async sign(claims, kid = "k1") {
      const input = `${segment({ alg: "ES256", typ: "JWT", kid })}.${segment(claims)}`;
      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        pair.privateKey,
        encoder.encode(input),
      );
      return `${input}.${base64Url(new Uint8Array(signature))}`;
    },
    answerToken: async () => new Response(null, { status: 400 }),
    async fetch(input, init) {
      const request =
        input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      if (url.pathname === "/oauth/jwks.json") {
        pawl.jwksFetches += 1;
        if (pawl.keysDown) return new Response(null, { status: 503 });
        return Response.json({
          keys: [
            {
              kty: "EC",
              crv: "P-256",
              x: jwk.x,
              y: jwk.y,
              alg: "ES256",
              use: "sig",
              kid: "k1",
            },
          ],
        });
      }
      if (url.pathname === "/oauth/token") {
        const form = new URLSearchParams(await request.text());
        pawl.tokenRequests.push(form);
        pawl.tokenHeaders.push(request.headers);
        return pawl.answerToken(form);
      }
      if (url.pathname === "/internal/session") {
        return pawl.sharedSession
          ? Response.json(pawl.sharedSession)
          : new Response(null, { status: 401 });
      }
      if (url.pathname === "/internal/devices") {
        const id = url.searchParams.get("id") ?? "";
        return Response.json({ devices: pawl.devices[id] ?? 0 });
      }
      return new Response(null, { status: 404 });
    },
  };
  return pawl;
}

export function accessClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: ISSUER,
    aud: [CLIENT_ID, ISSUER],
    sub: "user-1",
    scope: "openid email profile",
    client_id: CLIENT_ID,
    role: "ADMIN",
    preferred_username: "owner",
    email: "owner@product.test",
    email_verified: true,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  };
}
