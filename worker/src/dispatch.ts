import { INTERNAL_HOSTS } from "@pawl/topology";

import gateway, { type Env as GatewayEnv } from "./gateway/app";
import pass from "./pass/app";
import type { Env as PassEnv } from "./pass/env";

export type Env = PassEnv & GatewayEnv & { OIDC_ISSUER: string };

interface Half<E> {
  fetch(
    request: Request,
    env: E,
    ctx: ExecutionContext,
  ): Response | Promise<Response>;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost"]);
const ACCOUNT_APP = "/pass";

function isInternal(url: URL): boolean {
  return (
    url.hostname === INTERNAL_HOSTS.PASS ||
    url.hostname === INTERNAL_HOSTS.GATEWAY
  );
}

function isProvider(url: URL, issuer: string): boolean {
  if (url.hostname === INTERNAL_HOSTS.PASS) return true;
  const provider = new URL(issuer);
  if (LOOPBACK.has(provider.hostname)) {
    return LOOPBACK.has(url.hostname) && url.port === provider.port;
  }
  return url.host === provider.host;
}

function withoutStatedIdentity(request: Request): Request {
  const headers = new Headers(request.headers);
  const stated = [...headers.keys()].filter((name) =>
    name.startsWith("x-pawl-"),
  );
  if (stated.length === 0) return request;
  for (const name of stated) headers.delete(name);
  return new Request(request, { headers });
}

function isPage(request: Request): boolean {
  return (
    ["GET", "HEAD"].includes(request.method) &&
    (request.headers.get("accept") ?? "").includes("text/html")
  );
}

function fetcher(
  fetch: (request: Request) => Response | Promise<Response>,
): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(new Request(input, init)),
  } as unknown as Fetcher;
}

function inProcess<E>(half: Half<E>, env: () => E, ctx: ExecutionContext) {
  return fetcher((request) => half.fetch(request, env(), ctx));
}

function accountAppAssets(assets: Fetcher): Fetcher {
  return fetcher(async (request) => {
    const at = (pathname: string) => {
      const url = new URL(request.url);
      url.pathname = pathname;
      return new Request(url, request);
    };
    let response = await assets.fetch(
      at(`${ACCOUNT_APP}${new URL(request.url).pathname}`),
    );
    if (response.status === 404 && isPage(request)) {
      response = await assets.fetch(at(`${ACCOUNT_APP}/`));
    }
    const location = response.headers.get("location");
    if (!location?.startsWith(`${ACCOUNT_APP}/`)) return response;
    const headers = new Headers(response.headers);
    headers.set("location", location.slice(ACCOUNT_APP.length));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
}

function cabinetAssets(assets: Fetcher): Fetcher {
  return fetcher((request) => {
    const { pathname } = new URL(request.url);
    if (pathname === ACCOUNT_APP || pathname.startsWith(`${ACCOUNT_APP}/`)) {
      return new Response("Not found", { status: 404 });
    }
    return assets.fetch(request);
  });
}

export function halves(
  env: Env,
  ctx: ExecutionContext,
): { pass: PassEnv; gateway: GatewayEnv } {
  const result = {} as { pass: PassEnv; gateway: GatewayEnv };
  result.pass = {
    ...env,
    PUBLIC_ORIGIN: env.OIDC_ISSUER,
    ASSETS: accountAppAssets(env.ASSETS),
    GATEWAY: inProcess(gateway as Half<GatewayEnv>, () => result.gateway, ctx),
  };
  result.gateway = {
    ...env,
    ASSETS: cabinetAssets(env.ASSETS),
    PASS: inProcess(pass as Half<PassEnv>, () => result.pass, ctx),
  };
  return result;
}

export async function handle(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const incoming = isInternal(url) ? request : withoutStatedIdentity(request);
  const { pass: passEnv, gateway: gatewayEnv } = halves(env, ctx);
  return isProvider(url, env.OIDC_ISSUER)
    ? (pass as Half<PassEnv>).fetch(incoming, passEnv, ctx)
    : (gateway as Half<GatewayEnv>).fetch(incoming, gatewayEnv, ctx);
}
