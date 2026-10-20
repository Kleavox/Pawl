import { describe, expect, it } from "vitest";

import { halves, handle, type Env } from "./dispatch";

const ctx = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
} as unknown as ExecutionContext;

function assets(files: Record<string, string | Response>) {
  const asked: Request[] = [];
  return {
    asked,
    paths: () => asked.map((request) => new URL(request.url).pathname),
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      asked.push(request);
      const file = files[new URL(request.url).pathname];
      if (file === undefined) return new Response("missing", { status: 404 });
      if (file instanceof Response) return file;
      return new Response(file, { headers: { "content-type": "text/html" } });
    },
  };
}

function identityDb() {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => ({ email: "ann@example.com", username: "ann" }),
      }),
    }),
  };
}

function env(overrides: Partial<Record<keyof Env, unknown>> = {}): Env {
  return {
    ENVIRONMENT: "development",
    PUBLIC_ORIGIN: "https://example.com",
    OIDC_ISSUER: "https://paw.example.com",
    ROOT_DOMAIN: "example.com",
    FROM_EMAIL: "Pawl <no-reply@example.com>",
    ASSETS: assets({}),
    DB: identityDb(),
    SESSIONS: {
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
    },
    ...overrides,
  } as unknown as Env;
}

async function serviceAt(url: string, target = env()): Promise<unknown> {
  const response = await handle(new Request(url), target, ctx);
  return ((await response.json()) as { service: string }).service;
}

describe("one Worker, two halves", () => {
  it("sends the provider's host to the provider and every other host to the gateway", async () => {
    expect(await serviceAt("https://paw.example.com/health")).toBe("pass");
    expect(await serviceAt("https://example.com/health")).toBe("gateway");
    expect(await serviceAt("https://www.example.com/health")).toBe("gateway");
  });

  it("answers each internal name with the half it names", async () => {
    expect(await serviceAt("http://pass.internal/health")).toBe("pass");
    expect(await serviceAt("http://gateway.internal/health")).toBe("gateway");
  });

  it("reaches the provider's internal routes only through its internal name", async () => {
    const internal = await handle(
      new Request("http://pass.internal/internal/identity?id=u1"),
      env(),
      ctx,
    );
    expect(await internal.json()).toEqual({
      email: "ann@example.com",
      username: "ann",
    });

    for (const url of [
      "https://example.com/internal/identity?id=u1",
      "https://paw.example.com/internal/identity?id=u1",
    ]) {
      const response = await handle(new Request(url), env(), ctx);
      expect(response.status, url).toBe(404);
      expect(await response.text(), url).not.toContain("ann@example.com");
    }
  });

  it("tells the halves apart locally by port, under either loopback name", async () => {
    const local = env({
      OIDC_ISSUER: "http://127.0.0.1:8787",
      PUBLIC_ORIGIN: "http://127.0.0.1:8786",
    });
    expect(await serviceAt("http://127.0.0.1:8787/health", local)).toBe("pass");
    expect(await serviceAt("http://localhost:8787/health", local)).toBe("pass");
    expect(await serviceAt("http://127.0.0.1:8786/health", local)).toBe(
      "gateway",
    );
    expect(await serviceAt("http://localhost:8786/health", local)).toBe(
      "gateway",
    );
  });

  it("lets one half call the other without leaving the Worker", async () => {
    const { gateway } = halves(env(), ctx);
    const response = await gateway.PASS!.fetch(
      "http://pass.internal/internal/identity?id=u1",
    );
    expect(await response.json()).toEqual({
      email: "ann@example.com",
      username: "ann",
    });
  });
});

describe("one asset directory", () => {
  it("serves the account app's files from under /pass/ on the provider's host", async () => {
    const files = assets({ "/pass/assets/app.js": "account" });
    const response = await handle(
      new Request("https://paw.example.com/assets/app.js"),
      env({ ASSETS: files }),
      ctx,
    );
    expect(await response.text()).toBe("account");
    expect(files.paths()).toEqual(["/pass/assets/app.js"]);
  });

  it("gives a page navigation to a deep link the account app itself", async () => {
    const files = assets({ "/pass/": "<html>account</html>" });
    const response = await handle(
      new Request("https://paw.example.com/account", {
        headers: { accept: "text/html" },
      }),
      env({ ASSETS: files }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<html>account</html>");
  });

  it("answers a missing file that is not a page with 404", async () => {
    const response = await handle(
      new Request("https://paw.example.com/assets/gone.js"),
      env({ ASSETS: assets({ "/pass/": "<html>account</html>" }) }),
      ctx,
    );
    expect(response.status).toBe(404);
  });

  it("keeps a redirect from the asset server on the provider's own paths", async () => {
    const files = assets({
      "/pass/index.html": new Response(null, {
        status: 307,
        headers: { location: "/pass/" },
      }),
    });
    const response = await handle(
      new Request("https://paw.example.com/index.html"),
      env({ ASSETS: files }),
      ctx,
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/");
  });

  it("never serves the account app's files on the cabinet's host", async () => {
    const files = assets({ "/pass/index.html": "<html>account</html>" });
    const response = await handle(
      new Request("https://example.com/pass/index.html", {
        headers: { accept: "text/html" },
      }),
      env({ ASSETS: files }),
      ctx,
    );
    expect(response.status).toBe(404);
    expect(files.paths()).toEqual([]);
  });
});

describe("stated identity", () => {
  it("drops an identity a browser states, on either half", async () => {
    for (const url of [
      "https://paw.example.com/assets/app.js",
      "https://example.com/assets/app.js",
    ]) {
      const files = assets({});
      await handle(
        new Request(url, {
          headers: { "x-pawl-user": "victim", "x-pawl-role": "ADMIN" },
        }),
        env({ ASSETS: files }),
        ctx,
      );
      expect(files.asked.length, url).toBeGreaterThan(0);
      for (const request of files.asked) {
        expect(request.headers.get("x-pawl-user"), url).toBeNull();
        expect(request.headers.get("x-pawl-role"), url).toBeNull();
      }
    }
  });

  it("keeps the identity a caller states on an internal name", async () => {
    const files = assets({ "/pass/assets/app.js": "account" });
    await handle(
      new Request("http://pass.internal/assets/app.js", {
        headers: { "x-pawl-user": "u1" },
      }),
      env({ ASSETS: files }),
      ctx,
    );
    expect(files.asked[0]?.headers.get("x-pawl-user")).toBe("u1");
  });
});

describe("the clacks", () => {
  it("sends GNU Terry Pratchett up and down the line on every answer", async () => {
    const target = env({
      ASSETS: assets({ "/pass/": "<!doctype html>", "/robots.txt": "ok" }),
    });
    for (const url of [
      "https://example.com/health",
      "https://paw.example.com/health",
      "https://paw.example.com/",
      "https://example.com/robots.txt",
      "https://example.com/no/such/thing",
    ]) {
      const response = await handle(new Request(url), target, ctx);
      expect(response.headers.get("x-clacks-overhead"), url).toBe(
        "GNU Terry Pratchett",
      );
    }
  });

  it("keeps the answer's status and body", async () => {
    const response = await handle(
      new Request("https://example.com/health"),
      env(),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      service: "gateway",
      status: "ok",
    });
  });
});

describe("finger coke", () => {
  it("is answered on the provider's host too, by the gateway, which knows the bays", async () => {
    const response = await handle(
      new Request(
        "https://paw.example.com/.well-known/webfinger?resource=acct:coke@paw.example.com",
      ),
      env(),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/jrd+json");
    const body = (await response.json()) as { subject: string };
    expect(body.subject).toBe("acct:coke@paw.example.com");
  });
});

describe("WebFinger on an app's own host", () => {
  it("is left to the app: only Pawl's own hosts are answered", async () => {
    const response = await handle(
      new Request(
        "https://notes.example.com/.well-known/webfinger?resource=acct:coke@notes.example.com",
      ),
      env(),
      ctx,
    );
    expect(response.headers.get("content-type")).not.toBe(
      "application/jrd+json",
    );
  });
});

describe("paw.'s own pages", () => {
  it("carry HSTS and leave compression to the edge", async () => {
    const target = env({ ASSETS: assets({ "/pass/": "<!doctype html>" }) });
    const response = await handle(
      new Request("https://paw.example.com/", {
        headers: { accept: "text/html" },
      }),
      target,
      ctx,
    );
    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000",
    );
    expect(response.headers.get("cache-control") ?? "").not.toContain(
      "no-transform",
    );
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });
});

describe("security.txt", () => {
  it("names the privacy contact on the cabinet's host and paw.'s", async () => {
    for (const url of [
      "https://example.com/.well-known/security.txt",
      "https://paw.example.com/.well-known/security.txt",
    ]) {
      const response = await handle(new Request(url), env(), ctx);
      expect(response.status, url).toBe(200);
      expect(response.headers.get("content-type"), url).toBe(
        "text/plain; charset=utf-8",
      );
      const text = await response.text();
      expect(text, url).toContain("Contact: mailto:privacy@example.com");
      expect(text, url).toContain(`Canonical: ${url}`);
    }
  });

  it("answers a HEAD as it answers a GET, here and for WebFinger", async () => {
    for (const url of [
      "https://example.com/.well-known/security.txt",
      "https://paw.example.com/.well-known/security.txt",
      "https://example.com/.well-known/webfinger?resource=acct:coke@example.com",
    ]) {
      const response = await handle(
        new Request(url, { method: "HEAD" }),
        env(),
        ctx,
      );
      expect(response.status, url).toBe(200);
      expect(response.headers.get("content-type"), url).toMatch(
        /^(text\/plain|application\/jrd\+json)/,
      );
    }
  });
});
