import { readFileSync } from "node:fs";

import { publicHost } from "@pawl/topology";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { app } from "./app";
import type { Env } from "./app";
import {
  accessClaims,
  CLIENT_ID,
  fakePawl,
  ISSUER,
  type FakePawl,
} from "./session/pawl.testkit";

let pawl: FakePawl;
let token: string;
const OIDC = { OIDC_ISSUER: ISSUER, OIDC_CLIENT_ID: CLIENT_ID };

beforeAll(async () => {
  pawl = await fakePawl();
  pawl.devices = { "user-1": 1 };
  token = await pawl.sign(accessClaims());
});

describe("Gateway public namespace", () => {
  it("renders the unified error page for an unknown HTML route", async () => {
    const response = await app.request(
      "https://product.test/no/such/path",
      { headers: { accept: "text/html" } },
      {
        ASSETS: {
          fetch: vi.fn(async () => new Response("nope", { status: 404 })),
        },
        PUBLIC_ORIGIN: "https://product.test",
      } as unknown as Env,
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Page not found");
  });

  it("names the site the manifest names, as the cabinet does", async () => {
    const response = await app.request(
      "https://product.test/no/such/path",
      { headers: { accept: "text/html" } },
      {
        ASSETS: {
          fetch: vi.fn(async () => new Response("nope", { status: 404 })),
        },
        PUBLIC_ORIGIN: "https://product.test",
        ESTATE_MANIFEST: JSON.stringify({
          site: { name: "Fixture" },
          apps: [],
        }),
      } as unknown as Env,
    );

    const body = await response.text();
    expect(body).toContain(">FIXTURE</a>");
    expect(body).not.toContain(">PAWL</a>");
  });
});

describe("Gateway estate endpoint", () => {
  it("rejects a request with no session cookie", async () => {
    const response = await app.request("https://product.test/api/estate", {}, {
      PASS: { fetch: vi.fn() },
      ASSETS: { fetch: vi.fn() },
      PUBLIC_ORIGIN: "https://product.test",
    } as unknown as Env);

    expect(response.status).toBe(401);
  });

  it("never reflects an origin outside the topology allowlist", async () => {
    const response = await app.request(
      "https://product.test/api/estate",
      {
        headers: {
          cookie: `__Host-session=${token}`,
          Origin: "https://evil.example",
        },
      },
      {
        PASS: pawl,
        ...OIDC,
        ASSETS: { fetch: vi.fn() },
        PUBLIC_ORIGIN: "https://product.test",
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("204s the OPTIONS preflight", async () => {
    const response = await app.request(
      "https://product.test/api/estate",
      { method: "OPTIONS" },
      {
        PASS: { fetch: vi.fn() },
        ASSETS: { fetch: vi.fn() },
        PUBLIC_ORIGIN: "https://product.test",
      } as unknown as Env,
    );

    expect(response.status).toBe(204);
  });

  it("derives the allowlist from PUBLIC_ORIGIN, not a spoofable Host header", async () => {
    const response = await app.request(
      "https://attacker.example/api/estate",
      {
        headers: {
          cookie: `__Host-session=${token}`,
          Origin: "https://notes.product.test",
        },
      },
      {
        PASS: pawl,
        ...OIDC,
        ASSETS: { fetch: vi.fn() },
        PUBLIC_ORIGIN: "https://product.test",
        ESTATE_MANIFEST: MANIFEST,
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://notes.product.test",
    );
  });
});

const MANIFEST = readFileSync(
  new URL("../../../tooling/e2e/fixture/estate.json", import.meta.url),
  "utf8",
);

function appsEnv(
  answer = (request: Request) => new Response(new URL(request.url).host),
) {
  const reached: string[] = [];
  const fetcher = (key: string) => ({
    fetch: async (input: Request | string, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      reached.push(`${key} ${request.method} ${request.url}`);
      return answer(request);
    },
  });
  return {
    reached,
    env: {
      ASSETS: {
        fetch: vi.fn(async () => new Response("asset", { status: 404 })),
      },
      PUBLIC_ORIGIN: "https://example.test",
      ESTATE_MANIFEST: MANIFEST,
      APP_NOTES: fetcher("notes"),
      APP_DOCS: fetcher("docs"),
    } as unknown as Env,
  };
}

describe("apps from the manifest", () => {
  it("never lets a browser state an identity, on any hop", async () => {
    const seen: Request[] = [];
    const { env } = appsEnv((request) => {
      seen.push(request);
      return new Response(null, { status: 404 });
    });
    const withPass = {
      ...env,
      PASS: { fetch: async () => new Response("pawl") },
    } as unknown as Env;
    const stated = () => ({
      headers: {
        "x-pawl-user": "victim",
        "x-pawl-role": "ADMIN",
        accept: "text/html",
      },
    });
    await app.request("https://docs.example.test/page", stated(), withPass);
    await app.request(
      "https://example.test/api/notes/list",
      stated(),
      withPass,
    );
    await app.request("https://example.test/hello", stated(), withPass);
    await app.request("https://example.test/n_abc123", stated(), withPass);
    expect(seen).toHaveLength(5);
    for (const request of seen) {
      expect(request.headers.get("x-pawl-user"), request.url).toBeNull();
      expect(request.headers.get("x-pawl-role"), request.url).toBeNull();
    }
  });

  it("hands an app's subdomain to its binding unchanged", async () => {
    const { env, reached } = appsEnv();
    await app.request("https://docs.example.test/page", {}, env);
    expect(reached).toEqual(["docs GET https://docs.example.test/page"]);
  });

  it("hands a proxy prefix to its app on the internal host", async () => {
    const { env, reached } = appsEnv();
    await app.request("https://example.test/api/notes/list?x=1", {}, env);
    expect(reached).toEqual([
      "notes GET http://notes.internal/api/notes/list?x=1",
    ]);
  });

  it("resolves an unreserved apex slug through the apex app, with the pawl headers", async () => {
    const seen: Request[] = [];
    const { env } = appsEnv((request) => {
      seen.push(request);
      return new Response(null, {
        status: 302,
        headers: { location: "https://elsewhere.test/" },
      });
    });
    const response = await app.request("https://example.test/hello", {}, env);
    expect(response.status).toBe(302);
    expect(new URL(seen[0]!.url).pathname).toBe("/internal/resolve/hello");
    expect(seen[0]!.headers.get("x-pawl-public-host")).toBe("example.test");
    expect(seen[0]!.headers.get("x-pawl-trace-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("never sends a reserved slug to the apex app", async () => {
    const { env, reached } = appsEnv();
    await app.request("https://example.test/notes", {}, env);
    expect(reached).toEqual([]);
  });

  it("serves a file slug from the apex app when the resolver does not know it", async () => {
    const { env, reached } = appsEnv((request) =>
      new URL(request.url).pathname.startsWith("/internal/resolve/")
        ? new Response(null, { status: 404 })
        : new Response("file page"),
    );
    const response = await app.request(
      "https://example.test/n_abc123",
      { headers: { accept: "text/html" } },
      env,
    );
    expect(await response.text()).toBe("file page");
    expect(reached[1]).toBe("notes GET http://notes.internal/n_abc123");
  });

  it("answers a named 503 when a registered app's binding is missing", async () => {
    const { env } = appsEnv();
    const response = await app.request("https://example.test/api/notes/x", {}, {
      ...env,
      APP_NOTES: undefined,
    } as unknown as Env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: "APP_UNAVAILABLE",
      app: "notes",
    });
  });

  it("allows the estate to be read from a registered app's origin", async () => {
    const { env } = appsEnv();
    const response = await app.request(
      "https://example.test/api/estate",
      { method: "OPTIONS", headers: { origin: "https://notes.example.test" } },
      env,
    );
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://notes.example.test",
    );
  });
});

describe("the estate endpoint", () => {
  function estateEnv(notes: () => Response) {
    return {
      ASSETS: { fetch: vi.fn(async () => new Response("asset")) },
      PUBLIC_ORIGIN: "https://example.test",
      ESTATE_MANIFEST: MANIFEST,
      PASS: pawl,
      ...OIDC,
      APP_NOTES: { fetch: async () => notes() },
    } as unknown as Env;
  }

  async function read(env: Env) {
    const response = await app.request(
      "https://example.test/api/estate",
      { headers: { cookie: `__Host-session=${token}` } },
      env,
    );
    return (await response.json()) as { tools: Record<string, unknown> };
  }

  it("asks every estate app, and only those, through its binding", async () => {
    const asked: string[] = [];
    const env = estateEnv(() =>
      Response.json({ count: 2, severity: null, attention: [] }),
    );
    (
      env as unknown as {
        APP_NOTES: { fetch: (url: string) => Promise<Response> };
      }
    ).APP_NOTES.fetch = async (url) => {
      asked.push(url);
      return Response.json({ count: 2, severity: null, attention: [] });
    };
    expect((await read(env)).tools).toEqual({
      pass: { count: 1, severity: null },
      notes: { count: 2, severity: null },
    });
    expect(asked).toEqual(["http://notes.internal/.well-known/pawl/estate"]);
  });

  it("calls a 401 or 403 locked", async () => {
    expect(
      (await read(estateEnv(() => new Response(null, { status: 403 })))).tools
        .notes,
    ).toBe("locked");
  });

  it("calls a failure unknown, never zero", async () => {
    expect(
      (await read(estateEnv(() => new Response("oops", { status: 500 })))).tools
        .notes,
    ).toBeNull();
    expect(
      (await read(estateEnv(() => Response.json({ nope: true })))).tools.notes,
    ).toBeNull();
  });
});

describe("the estate call itself", () => {
  it("tells an estate app which public host asked", async () => {
    const seen: Headers[] = [];
    const env = {
      ASSETS: { fetch: vi.fn(async () => new Response("asset")) },
      PUBLIC_ORIGIN: "https://example.test",
      ESTATE_MANIFEST: MANIFEST,
      PASS: pawl,
      ...OIDC,
      APP_NOTES: {
        fetch: async (_url: string, init?: RequestInit) => {
          seen.push(new Headers(init?.headers));
          return Response.json({ count: 0, severity: null, attention: [] });
        },
      },
    } as unknown as Env;
    await app.request(
      "http://localhost:8786/api/estate",
      { headers: { cookie: `__Host-session=${token}` } },
      env,
    );
    expect(seen[0]?.get("x-pawl-public-host")).toBe("localhost");
    expect(seen[0]?.get("cookie")).toBeNull();
    expect(seen[0]?.get("x-pawl-user")).toBe("user-1");
    expect(seen[0]?.get("x-pawl-role")).toBe("ADMIN");
  });
});
