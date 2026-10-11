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
  publicOrigin,
} from "@pawl/topology";
import { Hono, type Context } from "hono";

import { hostRedirect } from "./hosts";
import { IdentityUnavailable } from "./session/keys";
import {
  requireProviderInProduction,
  sessionState,
  type SessionEnv,
} from "./session/resolve";
import { registerSessionRoutes, silentArrival } from "./session/routes";
import {
  buildEstate,
  readEstate,
  type EstatePart,
  type PassSummary,
} from "./overview";

export interface Env extends SessionEnv {
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
  requireProviderInProduction(context.env);
  await next();
});

app.onError((error, context) => {
  console.error("[gateway]", error);
  if (error instanceof IdentityUnavailable) {
    return context.json(
      {
        code: "IDENTITY_UNAVAILABLE",
        message: "The gateway cannot reach Pawl to check who you are.",
      },
      503,
    );
  }
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

registerSessionRoutes(app);

app.use("/", async (context, next) => {
  const hostname = new URL(context.req.url).hostname;
  if (
    context.req.method === "GET" &&
    (isLoopback(hostname) ||
      hostname === new URL(context.env.PUBLIC_ORIGIN).hostname)
  ) {
    const hop = await silentArrival(context.req.raw, context.env);
    if (hop) return hop;
  }
  await next();
});

app.get("/api/session", async (context) => {
  const state = await sessionState(context.req.raw, context.env);
  if (state.kind === "signed-in") {
    return context.json({
      authenticated: true,
      identity: state.session.identity,
    });
  }
  return context.json(
    state.kind === "expired"
      ? { authenticated: false, reason: "expired" }
      : { authenticated: false },
  );
});

async function devicesOf(
  pass: Fetcher | undefined,
  userId: string,
): Promise<PassSummary | null> {
  if (!pass) return null;
  try {
    const response = await pass.fetch(
      `http://${INTERNAL_HOSTS.PASS}/internal/devices?id=${encodeURIComponent(userId)}`,
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { devices?: unknown };
    return typeof body.devices === "number" && Number.isInteger(body.devices)
      ? { devices: body.devices }
      : null;
  } catch {
    return null;
  }
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

  const state = await sessionState(context.req.raw, context.env);
  if (state.kind !== "signed-in") {
    return context.json(
      {
        code: state.kind === "expired" ? "SESSION_EXPIRED" : "UNAUTHENTICATED",
      },
      401,
      cors,
    );
  }
  const session = state.session;

  const raw = context.req.raw;
  const targets = registry(context.env).estateTargets();
  const [pass, ...answers] = await Promise.all([
    devicesOf(context.env.PASS, session.identity.id),
    ...targets.map((target) =>
      askEstate(context.env, target, appOrigins.get(target.key), {
        "x-pawl-user": session.identity.id,
        "x-pawl-role": session.identity.role,
        "x-pawl-public-host": new URL(raw.url).hostname,
      }),
    ),
  ]);
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

function withoutStatedIdentity(headers: Headers): Headers {
  const copy = new Headers(headers);
  for (const name of [...copy.keys()]) {
    if (name.startsWith("x-pawl-")) copy.delete(name);
  }
  return copy;
}

function cleaned(request: Request): Request {
  return new Request(request, {
    headers: withoutStatedIdentity(request.headers),
  });
}

async function withPerson(request: Request, env: Env): Promise<Request> {
  const state = await sessionState(request, env);
  if (state.kind !== "signed-in") return request;
  const headers = new Headers(request.headers);
  headers.set("x-pawl-user", state.session.identity.id);
  headers.set("x-pawl-role", state.session.identity.role);
  return new Request(request, { headers });
}

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
      return context.env.PASS.fetch(cleaned(context.req.raw));
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
      ? target.fetch(cleaned(context.req.raw))
      : unavailable(context, route.key);
  }
  if (route.kind === "proxy") {
    const target = binding(context.env, route.binding);
    if (!target) return unavailable(context, route.key);
    const internal = new URL(context.req.url);
    internal.hostname = route.host;
    internal.protocol = "http:";
    internal.port = "";
    return target.fetch(
      await withPerson(
        new Request(internal, cleaned(context.req.raw)),
        context.env,
      ),
    );
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
    const headers = withoutStatedIdentity(context.req.raw.headers);
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
      const hop = await silentArrival(context.req.raw, context.env);
      if (hop) return hop;
      const page = new URL(context.req.url);
      page.hostname = apex.host;
      page.protocol = "http:";
      page.port = "";
      return apexTarget.fetch(
        await withPerson(
          new Request(page, cleaned(context.req.raw)),
          context.env,
        ),
      );
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
