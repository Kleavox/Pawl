import type { Identity } from "@pawl/core";
import { renderConsentPage } from "@pawl/ui/pages";
import { EMPTY_MANIFEST, registryFor } from "@pawl/registry";
import { localWorkerOrigin } from "@pawl/topology";
import type { Context } from "hono";
import { pkceS256 } from "@pawl/oidc";

import type { Env } from "../env";
import { clearSessionCookie } from "../lib/cookies";
import { deleteSession, getSession, readSessionToken } from "../lib/session";
import { claimsFor, findClaimsUser, type ClaimsUser } from "../oidc/claims";
import {
  findClient,
  redirectUriAllowed,
  verifyClientSecret,
  type OidcClient,
} from "../oidc/clients";
import { consumeCode, issueCode } from "../oidc/codes";
import {
  findGrant,
  findGrantBySubject,
  grantIdForRefreshToken,
  issueRefreshToken,
  recordGrant,
  revokeGrant,
  revokeGrantFor,
  rotateRefreshToken,
} from "../oidc/grants";
import { publicJwks } from "../oidc/keys";
import {
  deriveSub,
  mintAccessToken,
  mintIdToken,
  TOKEN_TTL_SECONDS,
  verifyAccessToken,
} from "../oidc/tokens";
import {
  apiError,
  clientIp,
  currentSession,
  rateLimitError,
  safeAudit,
  type AppEnv,
  type PassApp,
} from "./shared";

type OidcContext = Context<AppEnv>;

const SUPPORTED_SCOPES = ["openid", "email", "profile"];
const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/u;
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/u;

const SCOPE_WORDS: Record<string, string> = {
  openid: "That it is you, by an identifier made for this site alone",
  email: "Your verified email address",
  profile: "Your username",
};

interface AuthorizeRequest {
  client: OidcClient;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  nonce: string | null;
  scopes: string[];
  prompt: string | null;
  query: string;
}

type ReadAuthorize =
  | { kind: "untrusted" }
  | { kind: "refused"; redirect: string }
  | { kind: "ok"; request: AuthorizeRequest };

function withParams(
  base: string,
  params: Record<string, string | null>,
): string {
  const target = new URL(base);
  for (const [name, value] of Object.entries(params)) {
    if (value !== null) target.searchParams.set(name, value);
  }
  return target.toString();
}

function refusal(request: AuthorizeRequest, error: string): string {
  return withParams(request.redirectUri, { error, state: request.state });
}

async function readAuthorize(
  env: Env,
  query: URLSearchParams,
): Promise<ReadAuthorize> {
  const client = await findClient(env, query.get("client_id") ?? "");
  const redirectUri = query.get("redirect_uri") ?? "";
  if (!client || !redirectUriAllowed(client, redirectUri)) {
    return { kind: "untrusted" };
  }

  const state = query.get("state");
  const refuse = (error: string): ReadAuthorize => ({
    kind: "refused",
    redirect: withParams(redirectUri, { error, state }),
  });

  if (query.get("response_type") !== "code") {
    return refuse("unsupported_response_type");
  }
  const codeChallenge = query.get("code_challenge") ?? "";
  if (
    query.get("code_challenge_method") !== "S256" ||
    !CODE_CHALLENGE.test(codeChallenge)
  ) {
    return refuse("invalid_request");
  }
  const scopes = [
    ...new Set((query.get("scope") ?? "").split(" ").filter(Boolean)),
  ];
  if (
    !scopes.includes("openid") ||
    scopes.some(
      (scope) =>
        !SUPPORTED_SCOPES.includes(scope) ||
        !client.allowedScopes.includes(scope),
    )
  ) {
    return refuse("invalid_scope");
  }

  return {
    kind: "ok",
    request: {
      client,
      redirectUri,
      state,
      codeChallenge,
      nonce: query.get("nonce"),
      scopes,
      prompt: query.get("prompt"),
      query: query.toString(),
    },
  };
}

function untrusted(context: OidcContext) {
  return apiError(
    context,
    400,
    "invalid_client",
    "Unknown client or redirect URI.",
  );
}

async function consented(
  env: Env,
  request: AuthorizeRequest,
  userId: string,
): Promise<boolean> {
  if (request.client.firstParty) return true;
  const grant = await findGrant(env, userId, request.client.id);
  return (
    grant !== null &&
    request.scopes.every((scope) => grant.scopes.includes(scope))
  );
}

async function redirectWithCode(
  context: OidcContext,
  request: AuthorizeRequest,
  userId: string,
) {
  const code = await issueCode(context.env, {
    clientId: request.client.id,
    userId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    nonce: request.nonce,
    scopes: request.scopes,
  });
  return context.redirect(
    withParams(request.redirectUri, { code, state: request.state }),
    302,
  );
}

const LOOPBACK = ["127.0.0.1", "localhost"];

function cabinetOrigin(requestUrl: string, env: Env): string {
  const hostname = new URL(requestUrl).hostname;
  return LOOPBACK.includes(hostname)
    ? localWorkerOrigin("gateway", hostname)
    : `https://${env.ROOT_DOMAIN}`;
}

function consentPage(
  request: AuthorizeRequest,
  identity: Identity,
  rootOrigin: string,
  siteName: string,
): string {
  return renderConsentPage({
    clientName: request.client.name,
    sector: request.client.sector,
    holder: identity.username ?? identity.email,
    scopes: request.scopes.map((scope) => SCOPE_WORDS[scope] ?? scope),
    query: request.query,
    rootOrigin,
    siteName,
  });
}

function trustedOrigin(context: OidcContext): boolean {
  const origin = context.req.header("origin");
  return (
    origin !== undefined &&
    (origin === context.env.PUBLIC_ORIGIN ||
      origin === new URL(context.req.url).origin)
  );
}

function tokenError(context: OidcContext, status: 400 | 401, error: string) {
  if (status === 401) context.header("WWW-Authenticate", "Basic");
  return context.json({ error }, status);
}

function parseBasic(
  header: string | undefined,
): { id: string; secret: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice("Basic ".length));
    const colon = decoded.indexOf(":");
    if (colon < 0) return null;
    return {
      id: decodeURIComponent(decoded.slice(0, colon)),
      secret: decodeURIComponent(decoded.slice(colon + 1)),
    };
  } catch {
    return null;
  }
}

async function authenticateClient(
  context: OidcContext,
  form: URLSearchParams,
): Promise<OidcClient | null> {
  const basic = parseBasic(context.req.header("authorization"));
  const posted = form.get("client_secret");
  if (basic && posted !== null) return null;
  const named = form.get("client_id");
  if (basic && named !== null && named !== basic.id) return null;
  const client = await findClient(context.env, basic?.id ?? named ?? "");
  if (!client) return null;
  const secret = basic?.secret ?? posted;
  if (!client.confidential) return secret === null ? client : null;
  if (secret === null) return null;
  return (await verifyClientSecret(context.env, client.id, secret))
    ? client
    : null;
}

async function tokenSet(
  env: Env,
  client: OidcClient,
  user: ClaimsUser,
  sub: string,
  scopes: string[],
  nonce: string | null,
): Promise<Record<string, string | number>> {
  return {
    access_token: await mintAccessToken(env, {
      audience: [client.id, env.PUBLIC_ORIGIN],
      sub,
      scopes,
      clientId: client.id,
      ...(client.firstParty
        ? { identity: { ...claimsFor(user, scopes), role: user.role } }
        : {}),
    }),
    token_type: "Bearer",
    expires_in: TOKEN_TTL_SECONDS,
    scope: scopes.join(" "),
    id_token: await mintIdToken(env, {
      client,
      sub,
      nonce,
      claims: claimsFor(user, scopes),
    }),
  };
}

async function exchangeCode(
  context: OidcContext,
  client: OidcClient,
  form: URLSearchParams,
) {
  const env = context.env;
  const consumed = await consumeCode(env, form.get("code") ?? "");
  if (consumed.kind === "replayed") {
    await revokeGrantFor(env, consumed.code.user_id, consumed.code.client_id);
    return tokenError(context, 400, "invalid_grant");
  }
  if (consumed.kind !== "valid")
    return tokenError(context, 400, "invalid_grant");

  const { code } = consumed;
  const verifier = form.get("code_verifier") ?? "";
  if (
    code.client_id !== client.id ||
    code.redirect_uri !== form.get("redirect_uri") ||
    !CODE_VERIFIER.test(verifier) ||
    pkceS256(verifier) !== code.code_challenge
  ) {
    return tokenError(context, 400, "invalid_grant");
  }

  const user = await findClaimsUser(env, code.user_id);
  if (!user) return tokenError(context, 400, "invalid_grant");

  const scopes = JSON.parse(code.scopes) as string[];
  const sub = await deriveSub(env, client, user.id);
  const grant = await recordGrant(env, user.id, client.id, sub, scopes);
  const body = await tokenSet(env, client, user, sub, scopes, code.nonce);
  if (!client.firstParty) {
    body.refresh_token = await issueRefreshToken(env, grant.id);
  }
  return context.json(body);
}

async function exchangeRefresh(
  context: OidcContext,
  client: OidcClient,
  form: URLSearchParams,
) {
  if (client.firstParty) return tokenError(context, 400, "unauthorized_client");
  const env = context.env;
  const rotated = await rotateRefreshToken(
    env,
    form.get("refresh_token") ?? "",
    client.id,
  );
  if (rotated.kind !== "rotated")
    return tokenError(context, 400, "invalid_grant");

  const user = await findClaimsUser(env, rotated.grant.userId);
  if (!user) {
    await revokeGrant(env, rotated.grant.id);
    return tokenError(context, 400, "invalid_grant");
  }
  const body = await tokenSet(
    env,
    client,
    user,
    rotated.grant.subject,
    rotated.grant.scopes,
    null,
  );
  body.refresh_token = rotated.raw;
  return context.json(body);
}

function bearer(header: string | undefined): string | null {
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

async function userinfo(context: OidcContext) {
  const env = context.env;
  const token = bearer(context.req.header("authorization"));
  const claims = token
    ? await verifyAccessToken(env, token, env.PUBLIC_ORIGIN)
    : null;
  const grant = claims?.client_id
    ? await findGrantBySubject(env, claims.client_id, claims.sub)
    : null;
  const user = grant ? await findClaimsUser(env, grant.userId) : null;
  if (!claims || !grant || !user) {
    context.header("WWW-Authenticate", 'Bearer error="invalid_token"');
    return context.json({ error: "invalid_token" }, 401);
  }
  const scopes = claims.scope
    .split(" ")
    .filter((scope) => grant.scopes.includes(scope));
  return context.json({ sub: claims.sub, ...claimsFor(user, scopes) });
}

async function revokeToken(
  env: Env,
  client: OidcClient,
  token: string,
): Promise<void> {
  const access = await verifyAccessToken(env, token, client.id);
  if (access) {
    const grant = await findGrantBySubject(env, client.id, access.sub);
    if (grant) await revokeGrant(env, grant.id);
    return;
  }
  const grantId = await grantIdForRefreshToken(env, token, client.id);
  if (grantId) await revokeGrant(env, grantId);
}

function logoutTarget(
  env: Env,
  client: OidcClient | null,
  requested: string | null,
): string {
  const home = new URL("/", env.PUBLIC_ORIGIN).toString();
  if (!client || !requested) return home;
  try {
    const origin = new URL(requested).origin;
    return client.redirectUris.some((uri) => new URL(uri).origin === origin)
      ? requested
      : home;
  } catch {
    return home;
  }
}

export function registerOidcRoutes(app: PassApp): void {
  app.use("/oauth/*", async (context, next) => {
    if (
      context.env.ENVIRONMENT === "production" &&
      !context.env.OIDC_SIGNING_KEY
    ) {
      return apiError(
        context,
        503,
        "signing_key_unavailable",
        "Pawl has no signing key.",
      );
    }
    const path = new URL(context.req.url).pathname;
    const limiter =
      path === "/oauth/authorize"
        ? context.env.AUTHORIZE_RATE_LIMIT
        : path === "/oauth/token"
          ? context.env.TOKEN_RATE_LIMIT
          : undefined;
    if (
      limiter &&
      !(await limiter.limit({ key: clientIp(context.req.raw) })).success
    ) {
      if (path === "/oauth/authorize") {
        const read = await readAuthorize(
          context.env,
          new URL(context.req.url).searchParams,
        );
        if (read.kind === "ok") {
          return context.redirect(
            refusal(read.request, "temporarily_unavailable"),
            302,
          );
        }
      }
      return rateLimitError(context, 60);
    }
    return next();
  });

  app.get("/.well-known/openid-configuration", (context) => {
    const issuer = context.env.PUBLIC_ORIGIN;
    context.header("Cache-Control", "public, max-age=3600");
    return context.json({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      userinfo_endpoint: `${issuer}/oauth/userinfo`,
      jwks_uri: `${issuer}/oauth/jwks.json`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      end_session_endpoint: `${issuer}/oauth/logout`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      subject_types_supported: ["public", "pairwise"],
      id_token_signing_alg_values_supported: ["ES256"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: SUPPORTED_SCOPES,
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

  app.get("/oauth/jwks.json", async (context) => {
    try {
      const jwks = await publicJwks(context.env);
      context.header("Cache-Control", "public, max-age=3600");
      return context.json(jwks);
    } catch (cause) {
      console.error("[pawl jwks]", cause);
      return apiError(
        context,
        503,
        "signing_key_unavailable",
        "Pawl has no signing key.",
      );
    }
  });

  app.get("/oauth/authorize", async (context) => {
    const read = await readAuthorize(
      context.env,
      new URL(context.req.url).searchParams,
    );
    if (read.kind === "untrusted") return untrusted(context);
    if (read.kind === "refused") return context.redirect(read.redirect, 302);
    const { request } = read;

    const session = await currentSession(context);
    if (!session) {
      if (request.prompt === "none") {
        return context.redirect(refusal(request, "login_required"), 302);
      }
      const signIn = new URL("/", context.env.PUBLIC_ORIGIN);
      signIn.searchParams.set(
        "returnTo",
        new URL(
          `/oauth/authorize?${request.query}`,
          context.env.PUBLIC_ORIGIN,
        ).toString(),
      );
      return context.redirect(signIn.toString(), 302);
    }

    const userId = session.identity.id;
    if (!(await consented(context.env, request, userId))) {
      if (request.prompt === "none") {
        return context.redirect(refusal(request, "consent_required"), 302);
      }
      return context.html(
        consentPage(
          request,
          session.identity,
          cabinetOrigin(context.req.url, context.env),
          registryFor(context.env.ESTATE_MANIFEST ?? EMPTY_MANIFEST).siteName(),
        ),
      );
    }
    return redirectWithCode(context, request, userId);
  });

  app.post("/oauth/consent", async (context) => {
    if (!trustedOrigin(context)) {
      return apiError(
        context,
        403,
        "invalid_origin",
        "Consent must come from Pawl's own page.",
      );
    }
    const session = await currentSession(context);
    if (!session) {
      return apiError(context, 401, "login_required", "Sign in to continue.");
    }
    const form = new URLSearchParams(await context.req.text());
    const read = await readAuthorize(
      context.env,
      new URLSearchParams(form.get("request") ?? ""),
    );
    if (read.kind === "untrusted") return untrusted(context);
    if (read.kind === "refused") return context.redirect(read.redirect, 302);
    const { request } = read;

    if (form.get("decision") !== "allow") {
      return context.redirect(refusal(request, "access_denied"), 302);
    }
    const userId = session.identity.id;
    await recordGrant(
      context.env,
      userId,
      request.client.id,
      await deriveSub(context.env, request.client, userId),
      request.scopes,
    );
    return redirectWithCode(context, request, userId);
  });

  app.post("/oauth/token", async (context) => {
    context.header("Cache-Control", "no-store");
    context.header("Pragma", "no-cache");
    const form = new URLSearchParams(await context.req.text());
    const client = await authenticateClient(context, form);
    if (!client) return tokenError(context, 401, "invalid_client");
    const grantType = form.get("grant_type");
    if (grantType === "authorization_code") {
      return exchangeCode(context, client, form);
    }
    if (grantType === "refresh_token") {
      return exchangeRefresh(context, client, form);
    }
    return tokenError(context, 400, "unsupported_grant_type");
  });

  app.on(["GET", "POST"], "/oauth/userinfo", userinfo);

  app.post("/oauth/revoke", async (context) => {
    const form = new URLSearchParams(await context.req.text());
    const client = await authenticateClient(context, form);
    if (!client) return tokenError(context, 401, "invalid_client");
    await revokeToken(context.env, client, form.get("token") ?? "");
    return context.body(null, 200);
  });

  app.post("/oauth/logout", async (context) => {
    const form = new URLSearchParams(await context.req.text());
    const token = readSessionToken(context.req.raw);
    const session = token ? await getSession(context.env, token) : null;
    if (token) await deleteSession(context.env, token);
    if (session) {
      await safeAudit(context.env, {
        userId: session.identity.id,
        type: "logout",
        request: context.req.raw,
      });
    }
    const client = await findClient(context.env, form.get("client_id") ?? "");
    context.header(
      "Set-Cookie",
      clearSessionCookie(context.req.raw, context.env),
    );
    return context.redirect(
      logoutTarget(context.env, client, form.get("post_logout_redirect_uri")),
      303,
    );
  });
}
