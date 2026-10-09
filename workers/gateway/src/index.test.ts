import { publicHost } from "@pawl/topology";
import { describe, expect, it, vi } from "vitest";

import { app } from "./index";
import type { Env } from "./index";

describe("Gateway public namespace", () => {
  it("tells Link which public host asked and traces the hop", async () => {
    const linkFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 404 }),
    );
    await app.request("https://product.test/launch", {}, {
      LINK: { fetch: linkFetch },
      ASSETS: { fetch: vi.fn(async () => new Response("asset")) },
      PUBLIC_ORIGIN: "https://product.test",
    } as unknown as Env);

    const sent = new Headers(linkFetch.mock.calls[0]?.[1]?.headers);
    expect(sent.get("x-pawl-public-host")).toBe("product.test");
    expect(sent.get("x-pawl-trace-id")).toMatch(/^[0-9a-f-]{36}$/u);
  });

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

  it("resolves normal slugs through Link", async () => {
    const linkFetch = vi.fn(async () =>
      Response.redirect("https://example.com", 302),
    );
    const response = await app.request("https://product.test/launch", {}, {
      LINK: { fetch: linkFetch },
      ASSETS: { fetch: vi.fn() },
      PUBLIC_ORIGIN: "https://product.test",
    } as unknown as Env);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/");
    expect(linkFetch).toHaveBeenCalledTimes(1);
  });

  it("serves the Link receiver when a file slug has no Link collision", async () => {
    const linkFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response("<main>receiver</main>", {
          headers: { "content-type": "text/html" },
        }),
      );
    const response = await app.request(
      "https://product.test/f_JG2nV6-pQ9",
      {},
      {
        LINK: { fetch: linkFetch },
        ASSETS: { fetch: vi.fn() },
        PUBLIC_ORIGIN: "https://product.test",
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("receiver");
    expect(linkFetch).toHaveBeenCalledTimes(2);
  });

  it("proxies public file APIs to Link", async () => {
    const linkFetch = vi.fn(async (request: Request) =>
      Response.json({ host: new URL(request.url).hostname }),
    );
    const response = await app.request(
      "https://product.test/api/public/f_JG2nV6-pQ9",
      {},
      {
        LINK: { fetch: linkFetch },
        ASSETS: { fetch: vi.fn() },
        PUBLIC_ORIGIN: "https://product.test",
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ host: "link.internal" });
  });

  it("proxies the receiver bundle to Link", async () => {
    const linkFetch = vi.fn(async (request: Request) =>
      Response.json({ path: new URL(request.url).pathname }),
    );
    const response = await app.request(
      "https://product.test/link-assets/index.js",
      {},
      {
        LINK: { fetch: linkFetch },
        ASSETS: { fetch: vi.fn() },
        PUBLIC_ORIGIN: "https://product.test",
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      path: "/link-assets/index.js",
    });
  });

  it("renders the unified error page for an unknown HTML route", async () => {
    const response = await app.request(
      "https://product.test/no/such/path",
      { headers: { accept: "text/html" } },
      {
        LINK: { fetch: vi.fn() },
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
      LINK: { fetch: vi.fn() },
      ASSETS: { fetch: vi.fn() },
      PUBLIC_ORIGIN: "https://product.test",
    } as unknown as Env);

    expect(response.status).toBe(401);
  });

  it("aggregates the two tools and echoes an allowed origin", async () => {
    const passFetch = vi.fn(async (url: string) => {
      if (url.includes("/internal/session")) {
        return Response.json({ identity: { id: "u1", role: "ADMIN" } });
      }
      if (url.includes("/api/sessions")) {
        return Response.json({ sessions: [{ id: "s1" }] });
      }
      return new Response(null, { status: 404 });
    });
    const linkFetch = vi.fn(async (url: string) => {
      if (url.includes("/api/links")) {
        return Response.json({
          data: [],
          meta: { page: 1, limit: 1, total: 5, totalPages: 5 },
        });
      }
      if (url.includes("/api/drops")) {
        return Response.json({ drops: [] });
      }
      if (url.includes("/api/admin/file-reports")) {
        return Response.json({ reports: [] });
      }
      if (url.includes("/api/admin/reports")) {
        return Response.json({ reports: [] });
      }
      return new Response(null, { status: 404 });
    });
    const response = await app.request(
      "https://product.test/api/estate",
      {
        headers: {
          cookie: "__Secure-pawl_session=tok",
          Origin: "https://link.product.test",
        },
      },
      {
        PASS: { fetch: passFetch },
        LINK: { fetch: linkFetch },
        ASSETS: { fetch: vi.fn() },
        PUBLIC_ORIGIN: "https://product.test",
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      role: "ADMIN",
      pass: { devices: 1 },
      link: { active: 5 },
    });
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://link.product.test",
    );
    expect(response.headers.get("vary")).toBe("Origin");
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
        LINK: { fetch: vi.fn(async () => new Response(null, { status: 404 })) },
        ASSETS: { fetch: vi.fn() },
        PUBLIC_ORIGIN: "https://product.test",
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("silences the whole link block when one of its own upstreams answers 200 with a wrong-shaped body, and keeps the other tools", async () => {
    const passFetch = vi.fn(async (url: string) => {
      if (url.includes("/internal/session")) {
        return Response.json({ identity: { id: "u1", role: "ADMIN" } });
      }
      if (url.includes("/api/sessions")) {
        return Response.json({ sessions: [{ id: "s1" }] });
      }
      return new Response(null, { status: 404 });
    });
    const linkFetch = vi.fn(async (url: string) => {
      if (url.includes("/api/links")) {
        return Response.json({ error: "unexpected envelope" });
      }
      if (url.includes("/api/drops")) {
        return Response.json({
          drops: [
            {
              publicToken: "f_ok",
              name: "fine.txt",
              downloadCount: 0,
              expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
              status: "ACTIVE",
            },
          ],
        });
      }
      if (url.includes("/api/admin/file-reports")) {
        return Response.json({ reports: [] });
      }
      if (url.includes("/api/admin/reports")) {
        return Response.json({
          reports: [
            {
              id: "r1",
              reason: "SPAM",
              status: "OPEN",
              created_at: new Date().toISOString(),
              slug: "still-open",
            },
          ],
        });
      }
      return new Response(null, { status: 404 });
    });
    const response = await app.request(
      "https://product.test/api/estate",
      { headers: { cookie: "__Secure-pawl_session=tok" } },
      {
        PASS: { fetch: passFetch },
        LINK: { fetch: linkFetch },
        ASSETS: { fetch: vi.fn() },
        PUBLIC_ORIGIN: "https://product.test",
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const degraded = (await response.json()) as {
      pass: unknown;
      link: unknown;
      attention: Array<{ kind: string }>;
    };
    expect(degraded.pass).toEqual({ devices: 1 });
    expect(degraded.link).toBeNull();
    expect(degraded.attention.map((item) => item.kind)).toContain(
      "abuse-report",
    );
  });

  it("reports a fully failed upstream as null, never as an all-zero block", async () => {
    const passFetch = vi.fn(async (url: string) => {
      if (url.includes("/internal/session")) {
        return Response.json({ identity: { id: "u1", role: "ADMIN" } });
      }
      return Response.json({ sessions: [{ id: "s1" }] });
    });

    const response = await app.request(
      "https://product.test/api/estate",
      { headers: { cookie: "__Secure-pawl_session=tok" } },
      {
        PASS: { fetch: passFetch },
        LINK: {
          fetch: vi.fn(async () => new Response(null, { status: 404 })),
        },
        ASSETS: { fetch: vi.fn() },
        PUBLIC_ORIGIN: "https://product.test",
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { link: unknown };
    expect(body.link).toBeNull();
  });

  it("merges file abuse reports with link abuse reports into the count and attention list", async () => {
    const passFetch = vi.fn(async (url: string) => {
      if (url.includes("/internal/session")) {
        return Response.json({ identity: { id: "u1", role: "ADMIN" } });
      }
      return Response.json({ sessions: [] });
    });
    const linkFetch = vi.fn(async (url: string) => {
      if (url.includes("/api/links")) {
        return Response.json({
          data: [],
          meta: { page: 1, limit: 1, total: 0, totalPages: 0 },
        });
      }
      if (url.includes("/api/drops")) {
        return Response.json({ drops: [] });
      }
      if (url.includes("/api/admin/file-reports")) {
        return Response.json({
          reports: [
            {
              id: "fr1",
              reason: "MALWARE",
              status: "OPEN",
              created_at: new Date().toISOString(),
              public_token: "f_evil",
            },
          ],
        });
      }
      if (url.includes("/api/admin/reports")) {
        return Response.json({ reports: [] });
      }
      return new Response(null, { status: 404 });
    });
    const response = await app.request(
      "https://product.test/api/estate",
      { headers: { cookie: "__Secure-pawl_session=tok" } },
      {
        PASS: { fetch: passFetch },
        LINK: { fetch: linkFetch },
        ASSETS: { fetch: vi.fn() },
        PUBLIC_ORIGIN: "https://product.test",
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      link: { reported: number };
      attention: Array<{ kind: string; title: string; href: string }>;
    };
    expect(body.link.reported).toBe(1);
    expect(
      body.attention.some(
        (item) =>
          item.kind === "abuse-report" &&
          item.title.includes("f_evil") &&
          item.href === "https://link.product.test/",
      ),
    ).toBe(true);
    expect(
      linkFetch.mock.calls.some((call) =>
        String(call[0]).includes("/api/admin/file-reports"),
      ),
    ).toBe(true);
  });

  it("does not hand an admin a calm payload when the abuse report endpoints failed", async () => {
    const passFetch = vi.fn(async (url: string) => {
      if (url.includes("/internal/session")) {
        return Response.json({ identity: { id: "u1", role: "ADMIN" } });
      }
      return Response.json({ sessions: [{ id: "s1" }] });
    });
    const linkFetch = vi.fn(async (url: string) => {
      if (url.includes("/api/links")) {
        return Response.json({
          data: [],
          meta: { page: 1, limit: 1, total: 5, totalPages: 5 },
        });
      }
      if (url.includes("/api/drops")) {
        return Response.json({ drops: [] });
      }
      return new Response(null, { status: 500 });
    });
    const response = await app.request(
      "https://product.test/api/estate",
      { headers: { cookie: "__Secure-pawl_session=tok" } },
      {
        PASS: { fetch: passFetch },
        LINK: { fetch: linkFetch },
        ASSETS: { fetch: vi.fn() },
        PUBLIC_ORIGIN: "https://product.test",
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      link: unknown;
      attention: unknown[];
    };
    expect(body.link).toBeNull();
    expect(body.attention).toEqual([]);
  });

  it("204s the OPTIONS preflight", async () => {
    const response = await app.request(
      "https://product.test/api/estate",
      { method: "OPTIONS" },
      {
        PASS: { fetch: vi.fn() },
        LINK: { fetch: vi.fn() },
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
          Origin: "https://link.product.test",
        },
      },
      {
        PASS: { fetch: passFetch },
        LINK: { fetch: vi.fn(async () => new Response(null, { status: 404 })) },
        ASSETS: { fetch: vi.fn() },
        PUBLIC_ORIGIN: "https://product.test",
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://link.product.test",
    );
  });
});

describe("Gateway auth proxy", () => {
  const baseEnv = {
    LINK: { fetch: vi.fn() },
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
