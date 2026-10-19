import { INTERNAL_HOSTS, SESSION_COOKIE } from "@pawl/config";
import { localWorkerOrigin } from "@pawl/topology";
import { signedInHint } from "./lib/cookies";
import { securityHeaders } from "./lib/http";
import { Hono } from "hono";

import { registerAccountRoutes } from "./routes/account";
import { registerAdminAppRoutes } from "./routes/admin-apps";
import { registerAuthRoutes } from "./routes/auth";
import { registerGrantRoutes } from "./routes/grants";
import { registerInternalRoutes } from "./routes/internal";
import { registerOAuthRoutes } from "./routes/oauth";
import { registerOtpRoutes } from "./routes/otp";
import { registerOidcRoutes } from "./routes/oidc";
import { apiError, currentSession, type AppEnv } from "./routes/shared";
import type { Env } from "./env";

const MIGRATED_TABLES = [
  "users",
  "identities",
  "verification_tokens",
  "auth_events",
  "account_keys",
  "otp_codes",
  "oauth_clients",
  "oauth_grants",
  "oauth_codes",
  "oauth_refresh_tokens",
  "outside_apps",
];

const CABINET_CODE_ROUTES = new Set([
  "/api/auth/otp/start",
  "/api/auth/otp/verify",
]);

const LOOPBACK = ["127.0.0.1", "localhost"];

function cabinetOrigins(request: Request, env: Env): string[] {
  return LOOPBACK.includes(new URL(request.url).hostname)
    ? LOOPBACK.map((hostname) => localWorkerOrigin("gateway", hostname))
    : [`https://${env.ROOT_DOMAIN}`];
}

function cabinetCors(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin");
  if (
    !CABINET_CODE_ROUTES.has(new URL(request.url).pathname) ||
    origin === null ||
    !cabinetOrigins(request, env).includes(origin)
  ) {
    return { Vary: "Origin" };
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

const app = new Hono<AppEnv>();

app.onError((cause, context) => {
  console.error("[pass]", cause);
  if (/no such table/i.test(String(cause))) {
    return context.json(
      {
        code: "service_not_ready",
        message: "Pass database migrations have not been applied.",
      },
      503,
    );
  }
  return context.json(
    {
      code: "internal_error",
      message: "Pass could not complete the request.",
    },
    500,
  );
});

app.use("*", securityHeaders({ referrerPolicy: "same-origin" }));

app.use("*", async (context, next) => {
  await next();
  const session = context.res.headers
    .getSetCookie()
    .find((line) => line.startsWith(`${SESSION_COOKIE}=`));
  if (session === undefined) return;
  context.res = new Response(context.res.body, context.res);
  context.res.headers.append(
    "Set-Cookie",
    signedInHint(context.req.raw, context.env, !session.includes("Max-Age=0")),
  );
});

app.options("/api/auth/otp/:step", (context) =>
  context.body(null, 204, {
    ...cabinetCors(context.req.raw, context.env),
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "600",
  }),
);

app.use("/api/auth/otp/*", async (context, next) => {
  await next();
  for (const [name, value] of Object.entries(
    cabinetCors(context.req.raw, context.env),
  )) {
    context.res.headers.set(name, value);
  }
});

app.use("/api/*", async (context, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(context.req.method)) {
    return next();
  }

  const contentType = context.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return apiError(
      context,
      415,
      "unsupported_media_type",
      "Use application/json.",
    );
  }

  const origin = context.req.header("origin");
  const requestOrigin = new URL(context.req.url).origin;
  const cabinet = CABINET_CODE_ROUTES.has(new URL(context.req.url).pathname)
    ? cabinetOrigins(context.req.raw, context.env)
    : [];
  const trustedOrigins = new Set([
    context.env.PUBLIC_ORIGIN,
    requestOrigin,
    ...cabinet,
  ]);

  if (
    (origin && !trustedOrigins.has(origin)) ||
    (!origin && context.env.ENVIRONMENT === "production")
  ) {
    return apiError(context, 403, "invalid_origin", "Request origin rejected.");
  }

  const referer = context.req.header("referer");
  if (
    context.env.ENVIRONMENT === "production" &&
    referer &&
    !referer.startsWith(context.env.PUBLIC_ORIGIN) &&
    !referer.startsWith(requestOrigin) &&
    !cabinet.some((origin) => referer.startsWith(origin))
  ) {
    return apiError(
      context,
      403,
      "invalid_referer",
      "Cross-site request blocked.",
    );
  }

  return next();
});

app.get("/health", (context) =>
  context.json({ service: "pass", status: "ok" }),
);

app.get("/ready", async (context) => {
  const result = await context.env.DB.prepare(
    `SELECT COUNT(*) AS total
     FROM sqlite_master
     WHERE type = 'table'
       AND name IN (${MIGRATED_TABLES.map((name) => `'${name}'`).join(", ")})`,
  ).first<{ total: number }>();
  const ready = result?.total === MIGRATED_TABLES.length;
  return context.json(
    { service: "pass", status: ready ? "ready" : "migration_required" },
    ready ? 200 : 503,
  );
});

app.get("/api/estate", async (context) => {
  if (!context.env.GATEWAY) {
    return context.json({ code: "GATEWAY_UNAVAILABLE" }, 503);
  }
  const headers = new Headers(context.req.raw.headers);
  for (const name of [...headers.keys()]) {
    if (name.startsWith("x-pawl-")) headers.delete(name);
  }
  const session = await currentSession(context);
  if (session) {
    headers.set("x-pawl-user", session.identity.id);
    headers.set("x-pawl-role", session.identity.role);
  }
  return context.env.GATEWAY.fetch(
    new Request(`http://${INTERNAL_HOSTS.GATEWAY}/api/estate`, { headers }),
  );
});

registerOAuthRoutes(app);
registerGrantRoutes(app);
registerAccountRoutes(app);
registerAdminAppRoutes(app);
registerAuthRoutes(app);
registerOtpRoutes(app);
registerInternalRoutes(app);
registerOidcRoutes(app);

app.all("*", (context) => context.env.ASSETS.fetch(context.req.raw));

export default app;
