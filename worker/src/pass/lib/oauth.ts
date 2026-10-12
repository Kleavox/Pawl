import { readCookie } from "@pawl/auth";
import type { Env } from "../env";
import { randomToken } from "./crypto";

export type OAuthProvider = "google" | "github";

export interface OAuthProfile {
  provider: OAuthProvider;
  subject: string;
  email: string;
  name: string;
}

interface OAuthState {
  provider: OAuthProvider;
  returnTo: string;
}

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
}

const STATE_TTL_SECONDS = 600;
const OAUTH_STATE_COOKIE = "__Secure-pawl_oauth";

function redirectWithCookie(location: string, cookie: string): Response {
  const headers = new Headers({ Location: location });
  headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function stateCookie(state: string): string {
  return `${OAUTH_STATE_COOKIE}=${state}; Path=/api/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_TTL_SECONDS}`;
}

export function clearedStateCookie(): string {
  return `${OAUTH_STATE_COOKIE}=; Path=/api/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function beginOAuth(
  request: Request,
  env: Env,
  provider: OAuthProvider,
): Promise<Response> {
  const config = providerConfig(env, provider);
  if (!config) {
    return oauthFailure(env, "provider_not_configured");
  }

  const state = randomToken();
  const returnTo = safeReturnTo(
    new URL(request.url).searchParams.get("returnTo"),
    env,
  );
  const value: OAuthState = { provider, returnTo };
  await env.SESSIONS.put(`oauth:${state}`, JSON.stringify(value), {
    expirationTtl: STATE_TTL_SECONDS,
  });

  const callback = callbackUrl(env, provider);
  const url =
    provider === "google"
      ? new URL("https://accounts.google.com/o/oauth2/v2/auth")
      : new URL("https://github.com/login/oauth/authorize");

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    provider === "google" ? "openid email profile" : "read:user user:email",
  );
  url.searchParams.set("state", state);
  if (provider === "google") {
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
  }

  return redirectWithCookie(url.toString(), stateCookie(state));
}

export async function finishOAuth(
  request: Request,
  env: Env,
  provider: OAuthProvider,
): Promise<{ profile: OAuthProfile; returnTo: string } | Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error");
  if (!state || !code || providerError) {
    return oauthFailure(env, providerError ?? "oauth_cancelled");
  }
  if (readCookie(request, OAUTH_STATE_COOKIE) !== state) {
    return oauthFailure(env, "oauth_state_expired");
  }

  const key = `oauth:${state}`;
  const stored = await env.SESSIONS.get<OAuthState>(key, "json");
  await env.SESSIONS.delete(key);
  if (!stored || stored.provider !== provider) {
    return oauthFailure(env, "oauth_state_expired");
  }

  const config = providerConfig(env, provider);
  if (!config) {
    return oauthFailure(env, "provider_not_configured");
  }

  try {
    const profile =
      provider === "google"
        ? await googleProfile(env, code, config)
        : await githubProfile(env, code, config);
    return { profile, returnTo: stored.returnTo };
  } catch {
    return oauthFailure(env, "oauth_failed");
  }
}

export function oauthFailure(env: Env, code: string): Response {
  const url = new URL(env.PUBLIC_ORIGIN);
  url.searchParams.set("oauthError", code);
  return redirectWithCookie(url.toString(), clearedStateCookie());
}

export function safeReturnTo(value: string | null, env: Env): string {
  if (!value) return env.PUBLIC_ORIGIN;
  try {
    const url = new URL(value);
    const root = env.ROOT_DOMAIN.toLowerCase();
    const host = url.hostname.toLowerCase();
    if (
      url.protocol === "https:" &&
      (host === root || host.endsWith(`.${root}`))
    ) {
      return url.toString();
    }
    if (
      env.ENVIRONMENT !== "production" &&
      host === new URL(env.PUBLIC_ORIGIN).hostname.toLowerCase()
    ) {
      return url.toString();
    }
  } catch {
    return env.PUBLIC_ORIGIN;
  }
  return env.PUBLIC_ORIGIN;
}

function providerConfig(env: Env, provider: OAuthProvider): OAuthConfig | null {
  const clientId =
    provider === "google" ? env.GOOGLE_CLIENT_ID : env.GITHUB_CLIENT_ID;
  const clientSecret =
    provider === "google" ? env.GOOGLE_CLIENT_SECRET : env.GITHUB_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function callbackUrl(env: Env, provider: OAuthProvider): string {
  return new URL(
    `/api/oauth/callback/${provider}`,
    env.PUBLIC_ORIGIN,
  ).toString();
}

async function googleProfile(
  env: Env,
  code: string,
  config: OAuthConfig,
): Promise<OAuthProfile> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: callbackUrl(env, "google"),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) throw new Error("google_token_failed");
  const token = await tokenResponse.json<{ access_token?: string }>();
  if (!token.access_token) throw new Error("google_token_missing");

  const profileResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  );
  if (!profileResponse.ok) throw new Error("google_profile_failed");
  const profile = await profileResponse.json<{
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  }>();
  if (!profile.sub || !profile.email || profile.email_verified !== true) {
    throw new Error("google_profile_invalid");
  }
  return {
    provider: "google",
    subject: profile.sub,
    email: profile.email.toLowerCase(),
    name: profile.name?.trim() || profile.email.split("@")[0] || "User",
  };
}

async function githubProfile(
  env: Env,
  code: string,
  config: OAuthConfig,
): Promise<OAuthProfile> {
  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: callbackUrl(env, "github"),
      }),
    },
  );
  if (!tokenResponse.ok) throw new Error("github_token_failed");
  const token = await tokenResponse.json<{ access_token?: string }>();
  if (!token.access_token) throw new Error("github_token_missing");

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token.access_token}`,
    "User-Agent": "Pawl",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const profileResponse = await fetch("https://api.github.com/user", {
    headers,
  });
  if (!profileResponse.ok) throw new Error("github_profile_failed");
  const profile = await profileResponse.json<{
    id?: number;
    login?: string;
    name?: string | null;
    email?: string | null;
  }>();
  if (!profile.id || !profile.login) throw new Error("github_profile_invalid");

  let email = profile.email;
  if (!email) {
    const emailResponse = await fetch("https://api.github.com/user/emails", {
      headers,
    });
    if (!emailResponse.ok) throw new Error("github_email_failed");
    const emails = await emailResponse.json<
      Array<{
        email: string;
        primary: boolean;
        verified: boolean;
        visibility: string | null;
      }>
    >();
    email =
      emails.find((item) => item.primary && item.verified)?.email ??
      emails.find((item) => item.verified)?.email ??
      null;
  }
  if (!email) throw new Error("github_email_missing");

  return {
    provider: "github",
    subject: String(profile.id),
    email: email.toLowerCase(),
    name: profile.name?.trim() || profile.login,
  };
}
