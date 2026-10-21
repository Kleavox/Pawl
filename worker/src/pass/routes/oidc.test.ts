import { MACHINE_PARTS } from "@pawl/ui/pages";
import { SESSION_COOKIE } from "@pawl/auth";
import { decodeBase64Url } from "@pawl/crypto";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../env";
import { hashToken } from "../lib/crypto";
import {
  migratedDb,
  seedClient,
  seedUser,
  type TestDb,
} from "../oidc/db.testkit";
import { findGrant } from "../oidc/grants";
import { mintAccessToken } from "../oidc/tokens";
import { createSession, getSession } from "../lib/session";
import { registerOidcRoutes } from "./oidc";
import type { AppEnv } from "./shared";

const ISSUER = "https://paw.product.test";
const DES_CB = "https://des.product.test/callback";
const ACCESS_CB = "https://team.cloudflareaccess.com/cdn-cgi/access/callback";
const SPA_CB = "https://spa.product.test/cb";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const SECRETS = { notes: "notes-secret", "docs-access": "access-secret" };

type ClientId = "notes" | "docs-access" | "spa";

let signingKey: string;
let challenge: string;
let db: TestDb;
let env: Env;
let app: Hono<AppEnv>;

function kv() {
  const store = new Map<string, string>();
  return {
    get: async (key: string, type?: string) => {
      const value = store.get(key) ?? null;
      return value !== null && type === "json" ? JSON.parse(value) : value;
    },
    put: async (key: string, value: string) => void store.set(key, value),
    delete: async (key: string) => void store.delete(key),
    list: async ({ prefix }: { prefix: string }) => ({
      keys: [...store.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name, metadata: {} })),
    }),
  };
}

function payloadOf(token: string): Record<string, unknown> {
  return JSON.parse(
    new TextDecoder().decode(decodeBase64Url(token.split(".")[1] ?? "")),
  ) as Record<string, unknown>;
}

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  signingKey = btoa(
    String.fromCharCode(...new Uint8Array(pkcs8 as ArrayBuffer)),
  );
  challenge = await hashToken(VERIFIER);
});

beforeEach(async () => {
  db = migratedDb();
  seedUser(db, {
    id: "user-1",
    email: "owner@product.test",
    username: "owner",
  });
  seedUser(db, { id: "user-2", email: "new@product.test", verified: false });
  seedClient(db, {
    id: "notes",
    name: "Notes",
    redirectUris: [DES_CB],
    firstParty: true,
    secretHash: await hashToken(SECRETS.notes),
  });
  seedClient(db, {
    id: "docs-access",
    name: "Docs",
    redirectUris: [ACCESS_CB],
    firstParty: false,
    secretHash: await hashToken(SECRETS["docs-access"]),
    sector: "cloudflareaccess.com",
  });
  seedClient(db, {
    id: "spa",
    redirectUris: [SPA_CB],
    firstParty: true,
    confidential: false,
  });
  env = {
    ENVIRONMENT: "production",
    PUBLIC_ORIGIN: ISSUER,
    ROOT_DOMAIN: "product.test",
    DB: db.DB,
    SESSIONS: kv(),
    OIDC_SIGNING_KEY: signingKey,
    OIDC_SUB_SECRET: "pairwise-secret",
  } as unknown as Env;
  app = new Hono<AppEnv>();
  registerOidcRoutes(app);
});

function call(path: string, init?: RequestInit, override?: Partial<Env>) {
  return app.request(new URL(path, ISSUER).toString(), init, {
    ...env,
    ...override,
  } as Env);
}

const callbacks: Record<ClientId, string> = {
  notes: DES_CB,
  "docs-access": ACCESS_CB,
  spa: SPA_CB,
};

function authorizeQuery(
  client: ClientId,
  params: Record<string, string> = {},
): string {
  return new URLSearchParams({
    client_id: client,
    redirect_uri: callbacks[client],
    response_type: "code",
    scope: "openid email profile",
    state: "s-1",
    nonce: "n-1",
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...params,
  }).toString();
}

async function cookieFor(userId = "user-1"): Promise<string> {
  const row = db.sqlite
    .prepare("SELECT email, username, role FROM users WHERE id = ?")
    .get(userId) as { email: string; username: string | null; role: "USER" };
  const { token } = await createSession(
    env,
    { id: userId, email: row.email, username: row.username, role: row.role },
    1,
  );
  return `${SESSION_COOKIE}=${token}`;
}

async function signedInAuthorize(
  client: ClientId,
  params: Record<string, string> = {},
  userId = "user-1",
  override?: Partial<Env>,
) {
  return call(
    `/oauth/authorize?${authorizeQuery(client, params)}`,
    { headers: { cookie: await cookieFor(userId) } },
    override,
  );
}

function location(response: Response): URL {
  return new URL(response.headers.get("location") ?? "about:blank");
}

async function codeFor(
  client: ClientId,
  userId = "user-1",
  params: Record<string, string> = {},
): Promise<string> {
  if (client === "docs-access") {
    await consent(client, "allow", userId, params);
  }
  const response = await signedInAuthorize(client, params, userId);
  const code = location(response).searchParams.get("code");
  if (!code) throw new Error(`no code: ${response.status}`);
  return code;
}

async function consent(
  client: ClientId,
  decision: "allow" | "deny",
  userId = "user-1",
  params: Record<string, string> = {},
  origin = ISSUER,
) {
  return call("/oauth/consent", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
      cookie: await cookieFor(userId),
    },
    body: new URLSearchParams({
      request: authorizeQuery(client, params),
      decision,
    }).toString(),
  });
}

function basic(client: string, secret: string): string {
  return `Basic ${btoa(`${encodeURIComponent(client)}:${encodeURIComponent(secret)}`)}`;
}

async function exchange(options: {
  client?: ClientId;
  code?: string;
  verifier?: string;
  redirectUri?: string;
  secret?: string | null;
}) {
  const client = options.client ?? "notes";
  const code = options.code ?? (await codeFor(client));
  const secret =
    options.secret === undefined
      ? (SECRETS as Record<string, string>)[client]
      : options.secret;
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: options.redirectUri ?? callbacks[client],
    code_verifier: options.verifier ?? VERIFIER,
  });
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (secret) headers.authorization = basic(client, secret);
  else form.set("client_id", client);
  return call("/oauth/token", {
    method: "POST",
    headers,
    body: form.toString(),
  });
}

async function refreshResponse(
  token: string,
  client: ClientId = "docs-access",
) {
  return call("/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: basic(
        client,
        (SECRETS as Record<string, string>)[client] ?? "",
      ),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token,
    }).toString(),
  });
}

async function grantRevoked(client = "docs-access"): Promise<boolean> {
  return (await findGrant(env, "user-1", client)) === null;
}

describe("discovery", () => {
  it("advertises the issuer and every endpoint a client needs", async () => {
    const response = await call("/.well-known/openid-configuration");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth/authorize`,
      token_endpoint: `${ISSUER}/oauth/token`,
      userinfo_endpoint: `${ISSUER}/oauth/userinfo`,
      jwks_uri: `${ISSUER}/oauth/jwks.json`,
      revocation_endpoint: `${ISSUER}/oauth/revoke`,
      end_session_endpoint: `${ISSUER}/oauth/logout`,
      pawl_subjects_endpoint: `${ISSUER}/oauth/subjects`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      subject_types_supported: ["public", "pairwise"],
      id_token_signing_alg_values_supported: ["ES256"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["openid", "email", "profile"],
      claims_supported: [
        "sub",
        "email",
        "email_verified",
        "preferred_username",
      ],
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post",
        "none",
      ],
    });
  });
});

describe("jwks", () => {
  it("publishes public keys only, cacheably", async () => {
    const response = await call("/oauth/jwks.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("max-age");
    const { keys } = (await response.json()) as { keys: object[] };
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toHaveProperty("d");
  });

  it("answers a named 503 rather than an empty key set when no key exists", async () => {
    const response = await call("/oauth/jwks.json", undefined, {
      ENVIRONMENT: "development",
      OIDC_SIGNING_KEY: undefined,
    });
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe(
      "signing_key_unavailable",
    );
  });
});

describe("/oauth/authorize", () => {
  it("refuses to redirect to an unregistered uri", async () => {
    const response = await call(
      `/oauth/authorize?${authorizeQuery("notes", { redirect_uri: "https://evil.test/cb" })}`,
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  it("refuses an unknown client without redirecting anywhere", async () => {
    const response = await call(
      `/oauth/authorize?${authorizeQuery("notes", { client_id: "nobody" })}`,
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  it("rejects plain PKCE", async () => {
    const response = await call(
      `/oauth/authorize?${authorizeQuery("notes", { code_challenge_method: "plain", code_challenge: VERIFIER })}`,
    );
    expect(response.status).toBe(302);
    expect(location(response).searchParams.get("error")).toBe(
      "invalid_request",
    );
  });

  it("rejects a request with no PKCE at all", async () => {
    const query = new URLSearchParams(authorizeQuery("notes"));
    query.delete("code_challenge");
    query.delete("code_challenge_method");
    const response = await call(`/oauth/authorize?${query}`);
    expect(location(response).searchParams.get("error")).toBe(
      "invalid_request",
    );
  });

  it("requires the openid scope", async () => {
    const response = await call(
      `/oauth/authorize?${authorizeQuery("notes", { scope: "email" })}`,
    );
    expect(location(response).searchParams.get("error")).toBe("invalid_scope");
  });

  it("refuses a scope the client was not allowed", async () => {
    const response = await call(
      `/oauth/authorize?${authorizeQuery("notes", { scope: "openid admin" })}`,
    );
    expect(location(response).searchParams.get("error")).toBe("invalid_scope");
  });

  it("answers login_required on the redirect uri when prompt=none and no session exists", async () => {
    const response = await call(
      `/oauth/authorize?${authorizeQuery("notes", { prompt: "none" })}`,
    );
    expect(response.status).toBe(302);
    const target = location(response);
    expect(target.origin + target.pathname).toBe(DES_CB);
    expect(target.searchParams.get("error")).toBe("login_required");
    expect(target.searchParams.get("state")).toBe("s-1");
  });

  it("sends a signed-out person to sign in, and back to this request afterwards", async () => {
    const response = await call(`/oauth/authorize?${authorizeQuery("notes")}`);
    expect(response.status).toBe(302);
    const target = location(response);
    expect(target.origin).toBe(ISSUER);
    const back = new URL(target.searchParams.get("returnTo") ?? "");
    expect(back.origin + back.pathname).toBe(`${ISSUER}/oauth/authorize`);
    expect(back.searchParams.get("client_id")).toBe("notes");
  });

  it("passes state through untouched", async () => {
    const state = "a b&c=d";
    const response = await call(
      `/oauth/authorize?${authorizeQuery("notes", { prompt: "none", state })}`,
    );
    expect(location(response).searchParams.get("state")).toBe(state);
  });

  it("hands a signed-in person's first-party client a code without asking", async () => {
    const response = await signedInAuthorize("notes");
    expect(response.status).toBe(302);
    const target = location(response);
    expect(target.origin + target.pathname).toBe(DES_CB);
    expect(target.searchParams.get("code")).toBeTruthy();
    expect(target.searchParams.get("state")).toBe("s-1");
  });
});

describe("consent", () => {
  it("is shown for a third-party client with no grant", async () => {
    const response = await signedInAuthorize("docs-access");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("cloudflareaccess.com");
    expect(body).toContain("Docs");
    expect(body).not.toContain("code=");
  });

  it("guards the page with a CSP whose form reaches only Pawl and the app's registered callback", async () => {
    const response = await signedInAuthorize("docs-access");
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self' https://team.cloudflareaccess.com; frame-ancestors 'none'",
    );
  });

  it("asks on the machine's screen, with one Allow, one Deny, and the keypad answering too", async () => {
    const body = await (await signedInAuthorize("docs-access")).text();
    expect(body).toContain("NOTHING SHARED YET");
    expect(body.match(/>Allow</g)).toHaveLength(1);
    expect(body.match(/>Deny</g)).toHaveLength(1);
    for (const [label, key, value] of [
      ["GO", "key--go", "allow"],
      ["CLR", "key--fn", "deny"],
    ] as const) {
      const button =
        new RegExp(
          `<button[^>]*>${label}(?:<(?:span|svg)[^>]*data-tactile[\\s\\S]*?)?</button>`,
        ).exec(body)?.[0] ?? "";
      expect(button, label).toContain(key);
      expect(button, label).toContain('type="submit"');
      expect(button, label).toContain('form="consent"');
      expect(button, label).toContain('name="decision"');
      expect(button, label).toContain(`value="${value}"`);
      expect(button, label).toContain('aria-describedby="keys-caption"');
    }
    expect(body).toContain("AN APP WANTS YOUR PASS");
    expect(body).toMatch(/data-page-bar[^>]*><span[^>]*>CONSENT</);
    expect(body).toMatch(/<div[^>]*data-camera[^>]*data-framing="screen"/);
    for (const part of MACHINE_PARTS) {
      expect(
        body.match(new RegExp(`data-part="${part}"`, "g")),
        part,
      ).toHaveLength(1);
    }
    expect(body).not.toMatch(/<header\b|<footer\b|<script\b/);
  });

  it("wears the site's own name on the marquee, as the cabinet does", async () => {
    const body = await (
      await signedInAuthorize("docs-access", {}, "user-1", {
        ESTATE_MANIFEST: JSON.stringify({
          site: { name: "Fixture" },
          apps: [],
        }),
      })
    ).text();
    expect(body).toContain(">FIXTURE</p>");
    expect(body).toContain(`© ${new Date().getFullYear()} Fixture`);
  });

  it("names the client's registered domain, not a value from the query", async () => {
    const response = await signedInAuthorize("docs-access", {
      client_name: "Totally Safe",
    });
    expect(await response.text()).not.toContain("Totally Safe");
  });

  it("answers consent_required instead of a page when prompt=none", async () => {
    const response = await signedInAuthorize("docs-access", {
      prompt: "none",
    });
    expect(location(response).searchParams.get("error")).toBe(
      "consent_required",
    );
  });

  it("records the grant and issues a code when allowed", async () => {
    const response = await consent("docs-access", "allow");
    expect(response.status).toBe(302);
    expect(location(response).searchParams.get("code")).toBeTruthy();
    expect(await grantRevoked()).toBe(false);
  });

  it("is skipped on a later sign-in once the grant exists", async () => {
    await consent("docs-access", "allow");
    const response = await signedInAuthorize("docs-access");
    expect(location(response).searchParams.get("code")).toBeTruthy();
  });

  it("is asked again when the client wants more than was granted", async () => {
    await consent("docs-access", "allow", "user-1", { scope: "openid" });
    const response = await signedInAuthorize("docs-access");
    expect(response.status).toBe(200);
  });

  it("tells the client access_denied when refused, and grants nothing", async () => {
    const response = await consent("docs-access", "deny");
    expect(location(response).searchParams.get("error")).toBe("access_denied");
    expect(location(response).searchParams.get("code")).toBeNull();
    expect(await grantRevoked()).toBe(true);
  });

  it("refuses a consent posted from another site", async () => {
    const response = await consent(
      "docs-access",
      "allow",
      "user-1",
      {},
      "https://evil.test",
    );
    expect(response.status).toBe(403);
    expect(await grantRevoked()).toBe(true);
  });

  it("validates the request it carries from scratch", async () => {
    const response = await consent("docs-access", "allow", "user-1", {
      redirect_uri: "https://evil.test/cb",
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  it("refuses a consent without a live session", async () => {
    const response = await call("/oauth/consent", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: ISSUER,
      },
      body: new URLSearchParams({
        request: authorizeQuery("docs-access"),
        decision: "allow",
      }).toString(),
    });
    expect(response.status).toBe(401);
  });
});

describe("/oauth/token", () => {
  it("exchanges a code for tokens a first-party client can trust", async () => {
    const response = await exchange({});
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = (await response.json()) as Record<string, string>;
    expect(body).toMatchObject({ token_type: "Bearer", expires_in: 600 });
    expect(payloadOf(body.id_token ?? "")).toMatchObject({
      iss: ISSUER,
      aud: "notes",
      sub: "user-1",
      nonce: "n-1",
      email: "owner@product.test",
      email_verified: true,
      preferred_username: "owner",
    });
    expect(payloadOf(body.access_token ?? "")).toMatchObject({
      aud: ["notes", ISSUER],
      sub: "user-1",
      client_id: "notes",
    });
  });

  it("rejects a code whose verifier does not match the challenge", async () => {
    const response = await exchange({
      verifier: "wrong-verifier-wrong-verifier-wrong-verifier",
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe(
      "invalid_grant",
    );
  });

  it("rejects a code presented for a different redirect uri", async () => {
    const response = await exchange({
      redirectUri: "https://des.product.test/other",
    });
    expect(response.status).toBe(400);
  });

  it("revokes the grant when a code is replayed", async () => {
    const code = await codeFor("docs-access");
    expect((await exchange({ client: "docs-access", code })).status).toBe(200);
    const second = await exchange({ client: "docs-access", code });
    expect(second.status).toBe(400);
    expect(await grantRevoked()).toBe(true);
  });

  it("requires a secret from a confidential client", async () => {
    const response = await exchange({ secret: null });
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: string }).error).toBe(
      "invalid_client",
    );
  });

  it("accepts a confidential client's secret in the form body too", async () => {
    const code = await codeFor("notes");
    const response = await call("/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: DES_CB,
        code_verifier: VERIFIER,
        client_id: "notes",
        client_secret: SECRETS.notes,
      }).toString(),
    });
    expect(response.status).toBe(200);
  });

  it("refuses a client that authenticates two ways at once", async () => {
    const code = await codeFor("notes");
    const response = await call("/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: basic("notes", SECRETS.notes),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: DES_CB,
        code_verifier: VERIFIER,
        client_secret: SECRETS.notes,
      }).toString(),
    });
    expect(response.status).toBe(401);
  });

  it("rejects a wrong secret in the form body", async () => {
    const code = await codeFor("notes");
    const response = await call("/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: DES_CB,
        code_verifier: VERIFIER,
        client_id: "notes",
        client_secret: "guess",
      }).toString(),
    });
    expect(response.status).toBe(401);
  });

  it("rejects a wrong secret", async () => {
    expect((await exchange({ secret: "guess" })).status).toBe(401);
  });

  it("refuses a code issued to another client", async () => {
    const code = await codeFor("spa");
    expect(
      (await exchange({ client: "notes", code, redirectUri: SPA_CB })).status,
    ).toBe(400);
  });

  it("lets a public client exchange with PKCE alone", async () => {
    const response = await exchange({ client: "spa", secret: null });
    expect(response.status).toBe(200);
  });

  it("gives a third-party client a pairwise sub and a refresh token", async () => {
    const response = await exchange({ client: "docs-access" });
    const body = (await response.json()) as Record<string, string>;
    expect(payloadOf(body.id_token ?? "").sub).not.toBe("user-1");
    expect(typeof body.refresh_token).toBe("string");
  });

  it("never hands a first-party client a refresh token", async () => {
    const body = (await (await exchange({})).json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("refresh_token");
  });

  it("lets no unverified email leave the provider", async () => {
    const code = await codeFor("notes", "user-2");
    const body = (await (await exchange({ code })).json()) as Record<
      string,
      string
    >;
    const claims = payloadOf(body.id_token ?? "");
    expect(claims).not.toHaveProperty("email");
    expect(claims).not.toHaveProperty("email_verified");
  });

  it("logs no secret material when an exchange fails", async () => {
    const lines: unknown[][] = [];
    const spies = (["error", "warn", "log", "info"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args);
      }),
    );
    const code = await codeFor("notes");
    await exchange({
      code,
      verifier: "wrong-verifier-wrong-verifier-wrong-verifier",
    });
    await exchange({ code, secret: "s3cret-client-secret" });
    for (const spy of spies) spy.mockRestore();
    const logged = JSON.stringify(lines);
    expect(logged).not.toContain("s3cret-client-secret");
    expect(logged).not.toContain(code);
  });
});

describe("refresh", () => {
  async function firstRefresh(): Promise<string> {
    const body = (await (await exchange({ client: "docs-access" })).json()) as {
      refresh_token: string;
    };
    return body.refresh_token;
  }

  it("rotates on use, and the old token stops working", async () => {
    const first = await firstRefresh();
    const response = await refreshResponse(first);
    expect(response.status).toBe(200);
    const second = ((await response.json()) as { refresh_token: string })
      .refresh_token;
    expect(second).not.toBe(first);
    expect((await refreshResponse(first)).status).toBe(400);
  });

  it("revokes the whole grant when a retired token is replayed", async () => {
    const first = await firstRefresh();
    const second = (
      (await (await refreshResponse(first)).json()) as {
        refresh_token: string;
      }
    ).refresh_token;
    await refreshResponse(first);
    expect((await refreshResponse(second)).status).toBe(400);
    expect(await grantRevoked()).toBe(true);
  });

  it("is refused to a first-party client", async () => {
    const response = await refreshResponse("anything", "notes");
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe(
      "unauthorized_client",
    );
  });
});

describe("/oauth/userinfo", () => {
  async function accessToken(client: ClientId = "notes"): Promise<string> {
    const body = (await (await exchange({ client })).json()) as {
      access_token: string;
    };
    return body.access_token;
  }

  it("answers the claims the token's scopes allow", async () => {
    const response = await call("/oauth/userinfo", {
      headers: { authorization: `Bearer ${await accessToken()}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sub: "user-1",
      email: "owner@product.test",
      email_verified: true,
      preferred_username: "owner",
    });
  });

  it("rejects an access token whose aud is another resource", async () => {
    const token = await mintAccessToken(env, {
      audience: "https://somewhere.else.test",
      sub: "user-1",
      scopes: ["openid", "email"],
      clientId: "notes",
    });
    const response = await call("/oauth/userinfo", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
  });

  it("stops answering once the grant is revoked", async () => {
    const token = await accessToken("docs-access");
    const grant = await findGrant(env, "user-1", "docs-access");
    db.sqlite
      .prepare(
        "UPDATE oauth_grants SET revoked_at = datetime('now') WHERE id = ?",
      )
      .run(grant?.id ?? "");
    const response = await call("/oauth/userinfo", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
  });

  it("answers 401 with a named reason when no token is sent", async () => {
    const response = await call("/oauth/userinfo");
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("invalid_token");
  });
});

describe("revocation", () => {
  async function revoke(token: string) {
    return call("/oauth/revoke", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: basic("docs-access", SECRETS["docs-access"]),
      },
      body: new URLSearchParams({ token }).toString(),
    });
  }

  it("revokes the grant behind a refresh token", async () => {
    const body = (await (await exchange({ client: "docs-access" })).json()) as {
      refresh_token: string;
    };
    expect((await revoke(body.refresh_token)).status).toBe(200);
    expect(await grantRevoked()).toBe(true);
  });

  it("revokes the grant behind an access token", async () => {
    const body = (await (await exchange({ client: "docs-access" })).json()) as {
      access_token: string;
    };
    expect((await revoke(body.access_token)).status).toBe(200);
    expect(await grantRevoked()).toBe(true);
  });

  it("answers 200 for an unknown token, to leak nothing", async () => {
    expect((await revoke("not-a-token")).status).toBe(200);
  });
});

describe("the provider's own guards", () => {
  it("refuses to serve Pawl in production without a signing key", async () => {
    const response = await call(
      `/oauth/authorize?${authorizeQuery("notes")}`,
      undefined,
      { OIDC_SIGNING_KEY: undefined },
    );
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe(
      "signing_key_unavailable",
    );
  });

  it("sends a rate-limited sign-in back to the app that asked, so nobody is stranded on an error", async () => {
    const spent = {
      AUTHORIZE_RATE_LIMIT: { limit: async () => ({ success: false }) },
    } as unknown as Partial<Env>;
    const response = await call(
      `/oauth/authorize?${authorizeQuery("notes", { prompt: "none" })}`,
      undefined,
      spent,
    );
    expect(response.status).toBe(302);
    const back = location(response);
    expect(`${back.origin}${back.pathname}`).toBe(DES_CB);
    expect(back.searchParams.get("error")).toBe("temporarily_unavailable");
    expect(back.searchParams.get("state")).toBe("s-1");
  });

  it("answers 429 itself when the rate-limited request names no client it trusts", async () => {
    const response = await call(
      "/oauth/authorize?client_id=nobody&redirect_uri=https%3A%2F%2Fevil.test%2F",
      undefined,
      {
        AUTHORIZE_RATE_LIMIT: { limit: async () => ({ success: false }) },
      } as unknown as Partial<Env>,
    );
    expect(response.status).toBe(429);
  });

  it("answers 429 when the token rate limit is spent", async () => {
    const response = await call(
      "/oauth/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "grant_type=authorization_code",
      },
      {
        TOKEN_RATE_LIMIT: { limit: async () => ({ success: false }) },
      } as unknown as Partial<Env>,
    );
    expect(response.status).toBe(429);
  });
});

describe("what an access token says about the person", () => {
  async function accessClaims(client: ClientId, userId = "user-1") {
    const code = await codeFor(client, userId);
    const body = (await (await exchange({ client, code })).json()) as {
      access_token: string;
    };
    return payloadOf(body.access_token);
  }

  it("tells a first-party client who the person is and what they may do", async () => {
    expect(await accessClaims("notes")).toMatchObject({
      sub: "user-1",
      role: "USER",
      preferred_username: "owner",
      email: "owner@product.test",
      email_verified: true,
    });
  });

  it("tells a first-party client when the person is an admin", async () => {
    db.sqlite
      .prepare("UPDATE users SET role = 'ADMIN' WHERE id = ?")
      .run("user-1");
    expect((await accessClaims("notes")).role).toBe("ADMIN");
  });

  it("tells a third-party client nothing beyond its pairwise subject", async () => {
    const claims = await accessClaims("docs-access");
    expect(claims).not.toHaveProperty("role");
    expect(claims).not.toHaveProperty("email");
    expect(claims).not.toHaveProperty("preferred_username");
    expect(claims).not.toHaveProperty("sid");
  });

  it("names the Pawl session a first-party token was made in", async () => {
    const { sid } = await accessClaims("notes");
    expect(typeof sid).toBe("string");
    expect(await env.SESSIONS.get(`session:${String(sid)}`)).not.toBeNull();
  });

  it("never puts an unverified address in a first-party access token", async () => {
    const claims = await accessClaims("notes", "user-2");
    expect(claims.sub).toBe("user-2");
    expect(claims).not.toHaveProperty("email");
    expect(claims).not.toHaveProperty("email_verified");
  });
});

describe("signing out through Pawl", () => {
  function tokenOf(cookie: string): string {
    return cookie.slice(`${SESSION_COOKIE}=`.length);
  }

  function logout(cookie: string, form: Record<string, string>) {
    return call("/oauth/logout", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie,
      },
      body: new URLSearchParams(form).toString(),
    });
  }

  it("ends this browser's Pawl session and returns to the app that asked", async () => {
    const cookie = await cookieFor();
    const response = await logout(cookie, {
      client_id: "notes",
      post_logout_redirect_uri: "https://des.product.test/",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://des.product.test/");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await getSession(env, tokenOf(cookie))).toBeNull();
  });

  it("returns to Pawl rather than to an origin the client never registered", async () => {
    for (const uri of [
      "https://evil.test/",
      "https://des.product.test.evil.test/",
      "https://des.product.test@evil.test/",
      "not a url",
    ]) {
      const response = await logout(await cookieFor(), {
        client_id: "notes",
        post_logout_redirect_uri: uri,
      });
      expect(response.headers.get("location"), uri).toBe(`${ISSUER}/`);
    }
  });

  it("returns to Pawl when the client is unknown", async () => {
    const response = await logout(await cookieFor(), {
      client_id: "nobody",
      post_logout_redirect_uri: "https://des.product.test/",
    });
    expect(response.headers.get("location")).toBe(`${ISSUER}/`);
  });

  it("leaves the person's other browsers signed in", async () => {
    const here = await cookieFor();
    const elsewhere = await cookieFor();
    await logout(here, { client_id: "notes" });
    expect(await getSession(env, tokenOf(elsewhere))).not.toBeNull();
  });

  it("is not a GET, so a link or an image cannot sign anyone out", async () => {
    const cookie = await cookieFor();
    await call("/oauth/logout?client_id=notes", { headers: { cookie } });
    expect(await getSession(env, tokenOf(cookie))).not.toBeNull();
  });

  it("is named in discovery", async () => {
    const config = (await (
      await call("/.well-known/openid-configuration")
    ).json()) as Record<string, unknown>;
    expect(config.end_session_endpoint).toBe(`${ISSUER}/oauth/logout`);
  });
});
