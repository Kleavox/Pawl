import { readCookie, SIGNED_IN_COOKIE } from "@pawl/auth";
import { pkceS256 } from "@pawl/oidc";
import type { Hono } from "hono";

import { IdentityUnavailable, keyringFor } from "./keys";
import { SESSION_COOKIE_NAME, sessionState, type SessionEnv } from "./resolve";
import { verifyToken } from "./token";

const SIGNIN_COOKIE_NAME = "__Host-signin";
const SILENT_COOKIE_NAME = "__Host-silent";
const SIGNIN_TTL_SECONDS = 600;
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const TOKEN_URL = "http://pass.internal/oauth/token";

interface PendingSignIn {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(value: string): string {
  return atob(value.replaceAll("-", "+").replaceAll("_", "/"));
}

function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function safePath(value: string | null | undefined): string {
  if (!value?.startsWith("/")) return "/";
  const base = "https://app.invalid";
  try {
    const resolved = new URL(value, base);
    return resolved.origin === base
      ? `${resolved.pathname}${resolved.search}`
      : "/";
  } catch {
    return "/";
  }
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function sessionCookie(
  token: string,
  maxAge = SESSION_COOKIE_MAX_AGE,
): string {
  return cookie(SESSION_COOKIE_NAME, token, maxAge);
}

function forgetSignedInHint(url: URL, env: SessionEnv): string {
  const root = env.PUBLIC_ORIGIN ? new URL(env.PUBLIC_ORIGIN).hostname : "";
  const shared =
    root !== "" && (url.hostname === root || url.hostname.endsWith(`.${root}`));
  return `${SIGNED_IN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0${shared ? `; Domain=.${root}` : ""}`;
}

function browserSessionCookie(name: string, value: string): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export async function silentArrival(
  request: Request,
  env: SessionEnv,
): Promise<Response | null> {
  if (request.headers.get("sec-fetch-dest") !== "document") return null;
  if (!env.PASS || !env.OIDC_ISSUER || !env.OIDC_CLIENT_ID) return null;
  let state: Awaited<ReturnType<typeof sessionState>>;
  try {
    state = await sessionState(request, env);
  } catch (cause) {
    if (cause instanceof IdentityUnavailable) return null;
    throw cause;
  }
  if (state.kind === "signed-in") return null;
  if (
    state.kind === "guest" &&
    (readCookie(request, SILENT_COOKIE_NAME) === "1" ||
      readCookie(request, SIGNED_IN_COOKIE) !== "1")
  ) {
    return null;
  }
  const url = new URL(request.url);
  const target = new URLSearchParams({
    returnTo: `${url.pathname}${url.search}`,
    prompt: "none",
  });
  return new Response(null, {
    status: 302,
    headers: {
      location: `/auth/signin?${target}`,
      "set-cookie": browserSessionCookie(SILENT_COOKIE_NAME, "1"),
    },
  });
}

const LOOPBACK = ["127.0.0.1", "localhost"];

function providerOrigin(url: URL, issuer: string): string {
  const provider = new URL(issuer);
  if (LOOPBACK.includes(url.hostname) && LOOPBACK.includes(provider.hostname)) {
    provider.hostname = url.hostname;
  }
  return provider.origin;
}

function callbackUri(url: URL): string {
  return new URL("/auth/callback", url.origin).toString();
}

function readPending(request: Request): PendingSignIn | null {
  const raw = readCookie(request, SIGNIN_COOKIE_NAME);
  if (!raw) return null;
  try {
    const value = JSON.parse(
      fromBase64Url(raw),
    ) as Partial<PendingSignIn> | null;
    if (
      typeof value?.state !== "string" ||
      typeof value.nonce !== "string" ||
      typeof value.verifier !== "string"
    ) {
      return null;
    }
    return {
      state: value.state,
      nonce: value.nonce,
      verifier: value.verifier,
      returnTo: safePath(value.returnTo),
    };
  } catch {
    return null;
  }
}

function basic(id: string, secret: string): string {
  return `Basic ${btoa(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`)}`;
}

export function registerSessionRoutes<E extends { Bindings: SessionEnv }>(
  routes: Hono<E>,
): void {
  routes.get("/auth/signin", async (context) => {
    const env = context.env;
    if (!env.PASS || !env.OIDC_ISSUER || !env.OIDC_CLIENT_ID) {
      return context.json(
        {
          code: "PASS_UNAVAILABLE",
          message:
            "This deployment has no identity provider to sign you in with.",
        },
        503,
      );
    }
    const url = new URL(context.req.url);
    const pending: PendingSignIn = {
      state: randomToken(),
      nonce: randomToken(),
      verifier: randomToken(),
      returnTo: safePath(url.searchParams.get("returnTo")),
    };
    const target = new URL(
      "/oauth/authorize",
      providerOrigin(url, env.OIDC_ISSUER),
    );
    for (const [name, value] of Object.entries({
      client_id: env.OIDC_CLIENT_ID,
      redirect_uri: callbackUri(url),
      response_type: "code",
      scope: "openid email profile",
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: pkceS256(pending.verifier),
      code_challenge_method: "S256",
    })) {
      target.searchParams.set(name, value);
    }
    if (url.searchParams.get("prompt") === "none") {
      target.searchParams.set("prompt", "none");
    }
    context.header(
      "Set-Cookie",
      cookie(
        SIGNIN_COOKIE_NAME,
        base64Url(new TextEncoder().encode(JSON.stringify(pending))),
        SIGNIN_TTL_SECONDS,
      ),
    );
    return context.redirect(target.toString(), 302);
  });

  routes.get("/auth/callback", async (context) => {
    const env = context.env;
    const url = new URL(context.req.url);
    const pending = readPending(context.req.raw);
    context.header("Set-Cookie", cookie(SIGNIN_COOKIE_NAME, "", 0), {
      append: true,
    });
    const toCabinet = (search: string) => {
      context.header(
        "Set-Cookie",
        browserSessionCookie(SILENT_COOKIE_NAME, "1"),
        {
          append: true,
        },
      );
      return context.redirect(
        new URL(`/${search}`, url.origin).toString(),
        302,
      );
    };
    if (!pending || url.searchParams.get("state") !== pending.state) {
      return toCabinet("");
    }
    const back = new URL(pending.returnTo, url.origin).toString();
    if (url.searchParams.get("error")) {
      context.header("Set-Cookie", cookie(SESSION_COOKIE_NAME, "", 0), {
        append: true,
      });
      if (url.searchParams.get("error") === "login_required") {
        context.header("Set-Cookie", forgetSignedInHint(url, env), {
          append: true,
        });
      }
      return context.redirect(back, 302);
    }
    if (
      !env.PASS ||
      !env.OIDC_ISSUER ||
      !env.OIDC_CLIENT_ID ||
      !env.OIDC_CLIENT_SECRET
    ) {
      return context.json(
        {
          code: "PASS_UNAVAILABLE",
          message:
            "This deployment has no identity provider to sign you in with.",
        },
        503,
      );
    }
    const exchanged = await env.PASS.fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        authorization: basic(env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET),
        "content-type": "application/x-www-form-urlencoded",
        "cf-connecting-ip": context.req.header("cf-connecting-ip") ?? "",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: url.searchParams.get("code") ?? "",
        redirect_uri: callbackUri(url),
        code_verifier: pending.verifier,
      }).toString(),
    });
    const tokens = exchanged.ok
      ? ((await exchanged.json().catch(() => null)) as {
          access_token?: string;
          id_token?: string;
        } | null)
      : null;
    const keyring = keyringFor(env.PASS);
    const expected = {
      issuer: env.OIDC_ISSUER,
      audience: env.OIDC_CLIENT_ID,
      now: Date.now(),
    };
    const id = tokens?.id_token
      ? await verifyToken(tokens.id_token, keyring, expected)
      : null;
    const access = tokens?.access_token
      ? await verifyToken(tokens.access_token, keyring, expected)
      : null;
    if (
      id?.kind !== "valid" ||
      id.claims.nonce !== pending.nonce ||
      access?.kind !== "valid" ||
      access.claims.sub !== id.claims.sub
    ) {
      return toCabinet("?signin=failed");
    }
    context.header(
      "Set-Cookie",
      cookie(
        SESSION_COOKIE_NAME,
        tokens!.access_token!,
        SESSION_COOKIE_MAX_AGE,
      ),
      { append: true },
    );
    context.header("Set-Cookie", cookie(SILENT_COOKIE_NAME, "", 0), {
      append: true,
    });
    return context.redirect(back, 302);
  });

  routes.post("/auth/signout", (context) => {
    const env = context.env;
    const url = new URL(context.req.url);
    if (context.req.header("origin") !== url.origin) {
      return context.json(
        { code: "INVALID_ORIGIN", message: "Request origin rejected." },
        403,
      );
    }
    context.header("Set-Cookie", cookie(SESSION_COOKIE_NAME, "", 0));
    context.header(
      "Set-Cookie",
      browserSessionCookie(SILENT_COOKIE_NAME, "1"),
      { append: true },
    );
    return context.json({
      action: env.OIDC_ISSUER
        ? new URL(
            "/oauth/logout",
            providerOrigin(url, env.OIDC_ISSUER),
          ).toString()
        : null,
      fields: {
        client_id: env.OIDC_CLIENT_ID ?? "",
        post_logout_redirect_uri: `${url.origin}/`,
      },
    });
  });
}
