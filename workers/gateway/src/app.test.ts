import { readFileSync } from "node:fs";

import { publicHost } from "@pawl/topology";
import { describe, expect, it, vi } from "vitest";

import { app } from "./app";
import type { Env } from "./app";

describe("Gateway public namespace", () => {
  it("signs the session out at Pass under the shared header", async () => {
    const passFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 404 }),
    );
    await app.request(
      "https://product.test/api/logout",
      { method: "POST", headers: { cookie: "__Secure-pawl_session=tok" } },
      {
        PASS: { fetch: passFetch },
        ASSETS: { fetch: vi.fn() },
        PUBLIC_ORIGIN: "https://product.test",
      } as unknown as Env,
    );

    expect(
      new Headers(passFetch.mock.calls[0]?.[1]?.headers).get("x-pawl-session"),
    ).toBe("tok");
  });

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
    const passFetch = vi.fn(async (url: string) => {
      if (url.includes("/internal/session")) {
        return Response.json({ identity: { id: "u1", role: "ADMIN" } });
      }
      return Response.json({ sessions: [] });
    });

    const response = await app.request(
      "https://product.test/api/estate",
      {
        headers: {
          cookie: "__Secure-pawl_session=tok",
          Origin: "https://evil.example",
        },
      },
      {
        PASS: { fetch: passFetch },
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
    const passFetch = vi.fn(async (url: string) => {
      if (url.includes("/internal/session")) {
        return Response.json({ identity: { id: "u1", role: "ADMIN" } });
      }
      return Response.json({ sessions: [] });
    });

    const response = await app.request(
      "https://attacker.example/api/estate",
      {
        headers: {
          cookie: "__Secure-pawl_session=tok",
          Origin: "https://notes.product.test",
        },
      },
      {
        PASS: { fetch: passFetch },
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

describe("Gateway auth proxy", () => {
  const baseEnv = {
    ASSETS: { fetch: vi.fn() },
    PASS: { fetch: vi.fn() },
    PUBLIC_ORIGIN: "https://example.test",
  };

  it("hands both the Pawl hostname and the old Pass hostname to Pass", async () => {
    const reached: string[] = [];
    const env = {
      ...baseEnv,
      PUBLIC_ORIGIN: "https://example.test",
      PASS: {
        fetch: async (input: Request) => {
          reached.push(new URL(input.url).hostname);
          return new Response("pass");
        },
      },
    } as unknown as Env;
    for (const host of ["paw.example.test", "pass.example.test"]) {
      const response = await app.request(`https://${host}/account`, {}, env);
      expect(await response.text()).toBe("pass");
    }
    expect(reached).toEqual(["paw.example.test", "pass.example.test"]);
  });

  it("hands Pass a hostname under the root domain, so the session it mints is scoped to every origin under the root domain", async () => {
    const seen: { host: string; origin: string | null }[] = [];
    const env = {
      ...baseEnv,
      PUBLIC_ORIGIN: "https://example.test",
      PASS: {
        fetch: async (input: Request) => {
          seen.push({
            host: new URL(input.url).host,
            origin: input.headers.get("origin"),
          });
          return new Response("{}", { status: 200 });
        },
      },
    } as unknown as Env;

    const response = await app.request(
      "https://example.test/api/auth/otp/verify",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.test",
        },
        body: "{}",
      },
      env,
    );

    const rootDomain = "example.test";
    expect(response.status).toBe(200);
    expect(seen[0]!.host).toBe(publicHost(rootDomain, "pass"));
    expect(seen[0]!.origin).toBe(`https://${publicHost(rootDomain, "pass")}`);
    expect(seen[0]!.host.endsWith(`.${rootDomain}`)).toBe(true);
  });

  it("keeps the request's own hostname when it is not under the root domain, so a local session is not scoped to a domain the browser would refuse", async () => {
    const seen: { host: string; origin: string | null }[] = [];
    const env = {
      ...baseEnv,
      PUBLIC_ORIGIN: "https://example.test",
      PASS: {
        fetch: async (input: Request) => {
          seen.push({
            host: new URL(input.url).host,
            origin: input.headers.get("origin"),
          });
          return new Response("{}", { status: 200 });
        },
      },
    } as unknown as Env;

    const response = await app.request(
      "http://localhost:8786/api/auth/otp/verify",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:8786",
        },
        body: "{}",
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(seen[0]!.host).toBe("localhost:8786");
    expect(seen[0]!.origin).toBe("http://localhost:8786");
  });

  it("forwards a request whose Origin matches the request URL's own origin, even when PUBLIC_ORIGIN is different", async () => {
    const seen: { host: string; origin: string | null }[] = [];
    const env = {
      ...baseEnv,
      PUBLIC_ORIGIN: "https://different.example",
      PASS: {
        fetch: async (input: Request) => {
          seen.push({
            host: new URL(input.url).host,
            origin: input.headers.get("origin"),
          });
          return new Response("{}", { status: 200 });
        },
      },
    } as unknown as Env;

    const response = await app.request(
      "https://example.test/api/auth/otp/start",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.test",
        },
        body: "{}",
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(seen[0]!.host).toBe("example.test");
  });

  it("forwards a request whose Origin matches PUBLIC_ORIGIN, even when the request URL's own host is different", async () => {
    const seen: { host: string; origin: string | null }[] = [];
    const env = {
      ...baseEnv,
      PUBLIC_ORIGIN: "https://example.test",
      PASS: {
        fetch: async (input: Request) => {
          seen.push({
            host: new URL(input.url).host,
            origin: input.headers.get("origin"),
          });
          return new Response("{}", { status: 200 });
        },
      },
    } as unknown as Env;

    const response = await app.request(
      "https://staging-gateway.example/api/auth/otp/start",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.test",
        },
        body: "{}",
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(seen[0]!.host).toBe("staging-gateway.example");
  });

  it("does not hand Pass a path it has no route for", async () => {
    const passFetch = vi.fn(
      async () => new Response("<html>pass-single-page-app</html>"),
    );
    const assetsFetch = vi.fn(
      async () => new Response("nope", { status: 404 }),
    );
    const env = {
      ...baseEnv,
      PUBLIC_ORIGIN: "https://example.test",
      PASS: { fetch: passFetch },
      ASSETS: { fetch: assetsFetch },
    } as unknown as Env;

    const response = await app.request(
      "https://example.test/api/auth/anything",
      { headers: { accept: "text/html" } },
      env,
    );

    expect(passFetch).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("pass-single-page-app");
  });

  it("does not hand Pass a GET to an auth route that only answers POST", async () => {
    const passFetch = vi.fn(
      async () => new Response("<html>pass-single-page-app</html>"),
    );
    const env = {
      ...baseEnv,
      PUBLIC_ORIGIN: "https://example.test",
      PASS: { fetch: passFetch },
      ASSETS: {
        fetch: vi.fn(async () => new Response("nope", { status: 404 })),
      },
    } as unknown as Env;

    await app.request(
      "https://example.test/api/auth/otp/start",
      { headers: { origin: "https://example.test", accept: "text/html" } },
      env,
    );

    expect(passFetch).not.toHaveBeenCalled();
  });

  it("refuses to launder a cross-site origin into Pass", async () => {
    const passFetch = vi.fn(async () => new Response("{}", { status: 200 }));
    const env = {
      ...baseEnv,
      PUBLIC_ORIGIN: "https://example.test",
      PASS: { fetch: passFetch },
    } as unknown as Env;

    const response = await app.request(
      "https://example.test/api/auth/otp/start",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: "{}",
      },
      env,
    );

    expect(response.status).toBe(403);
    expect(passFetch).not.toHaveBeenCalled();
  });

  it("refuses a request with no Origin header at all", async () => {
    const passFetch = vi.fn(async () => new Response("{}", { status: 200 }));
    const env = {
      ...baseEnv,
      PUBLIC_ORIGIN: "https://example.test",
      PASS: { fetch: passFetch },
    } as unknown as Env;

    const response = await app.request(
      "https://example.test/api/auth/otp/start",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
      env,
    );

    expect(response.status).toBe(403);
    expect(passFetch).not.toHaveBeenCalled();
  });

  it("drops the browser referer before the internal hop", async () => {
    const seen: (string | null)[] = [];
    const env = {
      ...baseEnv,
      PUBLIC_ORIGIN: "https://example.test",
      PASS: {
        fetch: async (input: Request) => {
          seen.push(input.headers.get("referer"));
          return new Response("{}", { status: 200 });
        },
      },
    } as unknown as Env;

    await app.request(
      "https://example.test/api/auth/otp/start",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.test",
          referer: "https://example.test/",
        },
        body: "{}",
      },
      env,
    );

    expect(seen[0]).toBeNull();
  });

  it("preserves the request path and query string on the internal hop", async () => {
    const seen: string[] = [];
    const env = {
      ...baseEnv,
      PUBLIC_ORIGIN: "https://example.test",
      PASS: {
        fetch: async (input: Request) => {
          const url = new URL(input.url);
          seen.push(url.pathname + url.search);
          return new Response("{}", { status: 200 });
        },
      },
    } as unknown as Env;

    await app.request(
      "https://example.test/api/auth/otp/verify?flow=vending",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.test",
        },
        body: "{}",
      },
      env,
    );

    expect(seen[0]).toBe("/api/auth/otp/verify?flow=vending");
  });

  it("forwards the method and body unchanged", async () => {
    const seen: { method: string; body: string }[] = [];
    const env = {
      ...baseEnv,
      PUBLIC_ORIGIN: "https://example.test",
      PASS: {
        fetch: async (input: Request) => {
          seen.push({ method: input.method, body: await input.text() });
          return new Response("{}", { status: 200 });
        },
      },
    } as unknown as Env;

    await app.request(
      "https://example.test/api/auth/otp/verify",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.test",
        },
        body: '{"code":"123456"}',
      },
      env,
    );

    expect(seen[0]!.method).toBe("POST");
    expect(seen[0]!.body).toBe('{"code":"123456"}');
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
      PASS: {
        fetch: async (url: string) =>
          url.includes("/internal/session")
            ? Response.json({ identity: { id: "u1", role: "ADMIN" } })
            : Response.json({ sessions: [{ id: "s1" }] }),
      },
      APP_NOTES: { fetch: async () => notes() },
    } as unknown as Env;
  }

  async function read(env: Env) {
    const response = await app.request(
      "https://example.test/api/estate",
      { headers: { cookie: "__Secure-pawl_session=tok" } },
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
      PASS: {
        fetch: async (url: string) =>
          url.includes("/internal/session")
            ? Response.json({ identity: { id: "u1", role: "ADMIN" } })
            : Response.json({ sessions: [] }),
      },
      APP_NOTES: {
        fetch: async (_url: string, init?: RequestInit) => {
          seen.push(new Headers(init?.headers));
          return Response.json({ count: 0, severity: null, attention: [] });
        },
      },
    } as unknown as Env;
    await app.request(
      "http://localhost:8786/api/estate",
      { headers: { cookie: "__Secure-pawl_session=tok" } },
      env,
    );
    expect(seen[0]?.get("x-pawl-public-host")).toBe("localhost");
    expect(seen[0]?.get("cookie")).toBe("__Secure-pawl_session=tok");
  });
});
