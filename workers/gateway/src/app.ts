import { readCookie, requirePassInProduction, verifySession } from "@pawl/auth";
import { INTERNAL_URLS, SESSION_COOKIE } from "@pawl/config";
import { renderErrorPage, type DeployEnvironment } from "@pawl/core";
import {
  EMPTY_MANIFEST,
  registryFor,
  type Route,
  type Target,
} from "@pawl/registry";
import {
  INTERNAL_HOSTS,
  localWorkerOrigin,
  PUBLIC_SUBDOMAINS,
  publicHost,
  publicOrigin,
} from "@pawl/topology";
import { Hono, type Context } from "hono";

import { hostRedirect } from "./hosts";
import {
  buildEstate,
  readEstate,
  type EstatePart,
  type PassSummary,
} from "./overview";

export interface Env {
  ENVIRONMENT: DeployEnvironment;
  ASSETS: Fetcher;
  PASS?: Fetcher;
  PUBLIC_ORIGIN: string;
  ESTATE_MANIFEST?: string;
  [binding: string]: unknown;
}

const app = new Hono<{ Bindings: Env }>();

function registry(env: Env) {
  return registryFor(env.ESTATE_MANIFEST ?? EMPTY_MANIFEST);
}

function binding(env: Env, name: string): Fetcher | undefined {
  const value = env[name];
  return value && typeof (value as Fetcher).fetch === "function"
    ? (value as Fetcher)
    : undefined;
}

function unavailable(context: Context<{ Bindings: Env }>, key: string) {
  return context.json({ code: "APP_UNAVAILABLE", app: key }, 503);
}

function isLoopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

app.use("*", async (context, next) => {
  requirePassInProduction(context.env);
  await next();
});

app.onError((error, context) => {
  console.error("[gateway]", error);
  if (context.req.path.startsWith("/api")) {
    return context.json(
      {
        code: "INTERNAL_ERROR",
        message: "Pawl could not complete the request.",
      },
      500,
    );
  }
  return context.html(
    renderErrorPage({
      service: "Pawl",
      code: "500",
      title: "Something broke",
      message:
        "Something went wrong on our side. Give it a moment and try again.",
    }),
    500,
    {
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    },
  );
});

app.get("/health", (context) =>
  context.json({ service: "gateway", status: "ok" }),
);

app.get("/api/session", async (context) => {
  const session = await verifySession(context.req.raw, context.env.PASS);
  return session
    ? context.json({ authenticated: true, identity: session.identity })
    : context.json({ authenticated: false });
});

async function part<T>(
  fetcher: Fetcher | undefined,
  url: string,
  original: Request,
  isValid?: (value: unknown) => value is T,
): Promise<T | null> {
  if (!fetcher) return null;
  try {
    const response = await fetcher.fetch(url, {
      headers: { cookie: original.headers.get("cookie") ?? "" },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (isValid && !isValid(body)) return null;
    return body as T;
  } catch {
    return null;
  }
}

interface PassSessions {
  sessions: unknown[];
}

function isPassSessions(value: unknown): value is PassSessions {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { sessions?: unknown }).sessions)
  );
}

function originsFor(
  request: Request,
  env: Env,
): {
  allowed: Set<string>;
  appOrigins: Map<string, string>;
} {
  const publicOriginUrl = env.PUBLIC_ORIGIN;
  const publicHostname = new URL(publicOriginUrl).hostname;
  const pawl = isLoopback(publicHostname)
    ? [
        localWorkerOrigin("pass", publicHostname),
        localWorkerOrigin("gateway", publicHostname),
      ]
    : [
        publicOrigin(publicHostname, "pass"),
        publicOrigin(publicHostname, "gateway"),
      ];
  const view = registry(env).publicView(
    new URL(publicOriginUrl).origin,
    pawl[0]!,
  );
  const allowed = new Set([
    ...pawl,
    ...view.tools.map((tool) => tool.origin),
    ...view.footer.map((link) => link.href),
  ]);

  const requestUrl = new URL(request.url);
  const viewer = isLoopback(requestUrl.hostname)
    ? registry(env).publicView(
        requestUrl.origin,
        localWorkerOrigin("pass", requestUrl.hostname),
      )
    : view;
  const appOrigins = new Map(
    viewer.tools.map((tool) => [tool.key, tool.origin] as const),
  );

  return { allowed, appOrigins };
}

function corsHeaders(
  request: Request,
  allowed: Set<string>,
): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (origin === null || !allowed.has(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

app.options("/api/estate", (context) => {
  const { allowed } = originsFor(context.req.raw, context.env);
  return context.body(null, 204, {
    ...corsHeaders(context.req.raw, allowed),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
});

app.get("/api/estate", async (context) => {
  const { allowed, appOrigins } = originsFor(context.req.raw, context.env);
  const cors = corsHeaders(context.req.raw, allowed);

  const session = await verifySession(context.req.raw, context.env.PASS);
  if (!session) {
    return context.json({ code: "UNAUTHENTICATED" }, 401, cors);
  }

  const raw = context.req.raw;
  const cookie = raw.headers.get("cookie") ?? "";
  const targets = registry(context.env).estateTargets();
  const [sessions, ...answers] = await Promise.all([
    part<PassSessions>(
      context.env.PASS,
      `http://${INTERNAL_HOSTS.PASS}/api/sessions`,
      raw,
      isPassSessions,
    ),
    ...targets.map((target) =>
      askEstate(context.env, target, appOrigins.get(target.key), {
        cookie,
        "x-pawl-public-host": new URL(raw.url).hostname,
      }),
    ),
  ]);
  const pass: PassSummary | null = sessions
    ? { devices: sessions.sessions.length }
    : null;
  const parts = Object.fromEntries(
    targets.map((target, index) => [target.key, answers[index] ?? null]),
  );

  return context.json(buildEstate(session.identity.role, pass, parts), 200, {
    ...cors,
    "Cache-Control": "private, no-store",
  });
});

async function askEstate(
  env: Env,
  target: Target,
  origin: string | undefined,
  headers: Record<string, string>,
): Promise<EstatePart | "locked" | null> {
  const fetcher = binding(env, target.binding);
  if (!fetcher) return null;
  try {
    const response = await fetcher.fetch(
      `http://${target.host}/.well-known/pawl/estate`,
      { headers },
    );
    if (response.status === 401 || response.status === 403) return "locked";
    if (!response.ok) return null;
    const part = readEstate(await response.json(), origin ?? "");
    if (!part || origin) return part;
    return { ...part, attention: [] };
  } catch {
    return null;
  }
}

app.post("/api/logout", async (context) => {
  const token = readCookie(context.req.raw, SESSION_COOKIE);
  if (token && context.env.PASS) {
    const result = await context.env.PASS.fetch(INTERNAL_URLS.SESSION_LOGOUT, {
      method: "POST",
      headers: { "x-pawl-session": token },
    });
    if (result.ok) {
      const body = await result.json<{ cookie?: string }>();
      if (body.cookie) context.header("Set-Cookie", body.cookie);
    }
  }
  return context.json({ ok: true });
});

const PASS_AUTH_ROUTES = ["/api/auth/otp/start", "/api/auth/otp/verify"];

function passCookieUrl(requestUrl: string, publicOriginUrl: string): URL {
  const url = new URL(requestUrl);
  const rootDomain = new URL(publicOriginUrl).hostname.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  if (hostname === rootDomain || hostname.endsWith(`.${rootDomain}`)) {
    url.protocol = "https:";
    url.hostname = publicHost(rootDomain, "pass");
    url.port = "";
  }
  return url;
}

app.on("POST", PASS_AUTH_ROUTES, async (context) => {
  const origin = context.req.header("origin");
  const requestOrigin = new URL(context.req.url).origin;
  const trustedOrigins = new Set([context.env.PUBLIC_ORIGIN, requestOrigin]);
  if (!origin || !trustedOrigins.has(origin)) {
    return context.json({ code: "INVALID_ORIGIN" }, 403);
  }

  if (!context.env.PASS) {
    return context.json(
      {
        code: "PASS_UNAVAILABLE",
        message:
          "This deployment has no identity provider to sign you in with.",
      },
      503,
    );
  }

  const url = passCookieUrl(context.req.url, context.env.PUBLIC_ORIGIN);
  const headers = new Headers(context.req.raw.headers);
  headers.set("origin", url.origin);
  headers.delete("referer");

  return context.env.PASS.fetch(
    new Request(url, {
      method: context.req.method,
      headers,
      body: context.req.raw.body,
      duplex: "half",
    } as RequestInit & { duplex: "half" }),
  );
});

app.all("*", async (context) => {
  const url = new URL(context.req.url);
  const rootOrigin = new URL(context.env.PUBLIC_ORIGIN);
  const hostname = url.hostname.toLowerCase();

  if (hostname.endsWith(`.${rootOrigin.hostname}`)) {
    const subdomain = hostname.replace(`.${rootOrigin.hostname}`, "");

    if (
      (subdomain === PUBLIC_SUBDOMAINS.pass || subdomain === "pass") &&
      context.env.PASS
    ) {
      return context.env.PASS.fetch(context.req.raw);
    }
  }

  const rootHost = isLoopback(hostname) ? hostname : rootOrigin.hostname;
  const route: Route = registry(context.env).route(
    hostname,
    rootHost,
    url.pathname,
  );
  if (route.kind === "subdomain") {
    const target = binding(context.env, route.binding);
    return target
      ? target.fetch(context.req.raw)
      : unavailable(context, route.key);
  }
  if (route.kind === "proxy") {
    const target = binding(context.env, route.binding);
    if (!target) return unavailable(context, route.key);
    const internal = new URL(context.req.url);
    internal.hostname = route.host;
    internal.protocol = "http:";
    internal.port = "";
    return target.fetch(new Request(internal, context.req.raw));
  }

  const redirect = hostRedirect(url, context.env.PUBLIC_ORIGIN);
  if (redirect) return context.redirect(redirect.toString(), 308);

  const apex = registry(context.env).apex();
  const slug = getPublicSlug(url.pathname);
  const apexTarget = apex ? binding(context.env, apex.binding) : undefined;
  if (
    apex &&
    apexTarget &&
    slug &&
    !registry(context.env).isReserved(slug) &&
    ["GET", "HEAD", "POST"].includes(context.req.method)
  ) {
    const headers = new Headers(context.req.raw.headers);
    headers.set("x-pawl-public-host", url.hostname);
    headers.set("x-pawl-trace-id", crypto.randomUUID());
    const response = await apexTarget.fetch(
      `http://${apex.host}${apex.resolve}${encodeURIComponent(slug)}`,
      {
        method: context.req.method,
        headers,
        body:
          context.req.method === "GET" || context.req.method === "HEAD"
            ? undefined
            : context.req.raw.body,
        redirect: "manual",
      },
    );
    if (response.status !== 404) return response;
    if (
      apex.fileSlugPrefix &&
      slug.startsWith(apex.fileSlugPrefix) &&
      ["GET", "HEAD"].includes(context.req.method)
    ) {
      const page = new URL(context.req.url);
      page.hostname = apex.host;
      page.protocol = "http:";
      page.port = "";
      return apexTarget.fetch(new Request(page, context.req.raw));
    }
  }

  const assetResponse = await context.env.ASSETS.fetch(context.req.raw);
  if (
    assetResponse.status === 404 &&
    (context.req.header("accept") ?? "").includes("text/html")
  ) {
    return context.html(
      renderErrorPage({
        service: "Pawl",
        code: "404",
        title: "Page not found",
        message:
          "This page does not exist, or the short link or file has expired.",
      }),
      404,
      {
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      },
    );
  }
  return assetResponse;
});

function getPublicSlug(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 1) return null;

  const slug = parts[0];
  if (!slug || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(slug)) return null;
  return slug.toLowerCase();
}

export { app };
export default app;
