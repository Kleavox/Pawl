import { beforeEach, describe, expect, it, vi } from "vitest";

import { app, type Env } from "../app";
import {
  accessClaims,
  CLIENT_ID,
  CLIENT_SECRET,
  fakePawl,
  ISSUER,
  type FakePawl,
} from "./pawl.testkit";
import { requireProviderInProduction } from "./resolve";

const ROOT = "https://example.test";

let pawl: FakePawl;
let env: Env;

beforeEach(async () => {
  pawl = await fakePawl();
  env = {
    ENVIRONMENT: "production",
    PUBLIC_ORIGIN: ROOT,
    PASS: pawl,
    OIDC_ISSUER: ISSUER,
    OIDC_CLIENT_ID: CLIENT_ID,
    OIDC_CLIENT_SECRET: CLIENT_SECRET,
    ASSETS: {
      fetch: vi.fn(async () => new Response("<html>cabinet</html>")),
    },
  } as unknown as Env;
});

function setCookie(response: Response, name: string): string | undefined {
  return response.headers
    .getSetCookie()
    .find((line) => line.startsWith(`${name}=`));
}

function valueOf(response: Response, name: string): string | null {
  const line = setCookie(response, name);
  return line ? line.slice(name.length + 1).split(";")[0]! : null;
}

async function startSignIn(query = "returnTo=%2F%3Fbay%3D2") {
  const response = await app.request(`${ROOT}/auth/signin?${query}`, {}, env);
  return {
    response,
    authorize: new URL(response.headers.get("location") ?? "about:blank"),
    pending: valueOf(response, "__Host-signin") ?? "",
  };
}

function callback(pending: string, query: string) {
  return app.request(
    `${ROOT}/auth/callback?${query}`,
    { headers: { cookie: `__Host-signin=${pending}` } },
    env,
  );
}

async function session(cookie: string) {
  return (await (
    await app.request(`${ROOT}/api/session`, { headers: { cookie } }, env)
  ).json()) as Record<string, unknown>;
}

describe("the gateway signs people in through Pawl", () => {
  it("sends the person to Pawl with PKCE, state, nonce and its own callback", async () => {
    const { response, authorize, pending } = await startSignIn();
    expect(response.status).toBe(302);
    expect(`${authorize.origin}${authorize.pathname}`).toBe(
      `${ISSUER}/oauth/authorize`,
    );
    expect(authorize.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      `${ROOT}/auth/callback`,
    );
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("state")).toBeTruthy();
    expect(authorize.searchParams.get("nonce")).toBeTruthy();
    expect(pending).not.toBe("");
  });

  it("sends a local cabinet to the local Pawl under the same loopback name", async () => {
    const response = await app.request(
      "http://localhost:8786/auth/signin",
      {},
      env,
    );
    const authorize = new URL(response.headers.get("location") ?? "");
    expect(authorize.origin).toBe("http://localhost:8787");
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      "http://localhost:8786/auth/callback",
    );
  });

  it("asks silently when the cabinet asks silently", async () => {
    const { authorize } = await startSignIn("prompt=none");
    expect(authorize.searchParams.get("prompt")).toBe("none");
  });

  it("only ever returns to a path on the gateway", async () => {
    for (const foreign of [
      "%2F%2Fevil.test%2F",
      "https%3A%2F%2Fevil.test%2F",
      "%2F%09%2Fevil.test",
      "%2F%5Cevil.test",
    ]) {
      const { authorize, pending } = await startSignIn(`returnTo=${foreign}`);
      const response = await callback(
        pending,
        `error=login_required&state=${authorize.searchParams.get("state")}`,
      );
      expect(response.headers.get("location")).toBe(`${ROOT}/`);
    }
  });

  it("refuses a callback this browser did not start, back on the cabinet", async () => {
    const { pending } = await startSignIn();
    const response = await callback(pending, "code=c&state=forged");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${ROOT}/`);
    expect(valueOf(response, "__Host-silent")).toBe("1");
    expect(valueOf(response, "__Host-session")).toBeNull();
    expect(pawl.tokenRequests).toHaveLength(0);
  });

  it("forgets the signed-in hint when Pawl says nobody is signed in", async () => {
    const { pending, authorize } = await startSignIn();
    const response = await callback(
      pending,
      `error=login_required&state=${authorize.searchParams.get("state")}`,
    );
    expect(setCookie(response, "pawl-signed-in")).toMatch(
      /^pawl-signed-in=; .*Max-Age=0/u,
    );
    expect(setCookie(response, "pawl-signed-in")).toContain(
      "Domain=.example.test",
    );
  });

  it("returns a person Pawl did not know as a guest, to where they were", async () => {
    const { authorize, pending } = await startSignIn();
    const response = await callback(
      pending,
      `error=login_required&state=${authorize.searchParams.get("state")}`,
    );
    expect(response.headers.get("location")).toBe(`${ROOT}/?bay=2`);
    expect(valueOf(response, "__Host-session")).toBe("");
  });

  it("exchanges the code over the binding and keeps the token on its own origin", async () => {
    const { authorize, pending } = await startSignIn();
    const access = await pawl.sign(accessClaims());
    pawl.answerToken = async () =>
      Response.json({
        access_token: access,
        id_token: await pawl.sign(
          accessClaims({ nonce: authorize.searchParams.get("nonce") }),
        ),
      });
    const response = await app.request(
      `${ROOT}/auth/callback?code=the-code&state=${authorize.searchParams.get("state")}`,
      {
        headers: {
          cookie: `__Host-signin=${pending}`,
          "cf-connecting-ip": "203.0.113.9",
        },
      },
      env,
    );
    expect(response.headers.get("location")).toBe(`${ROOT}/?bay=2`);
    expect(valueOf(response, "__Host-session")).toBe(access);
    expect(setCookie(response, "__Host-session")).toContain("Max-Age=604800");
    expect(valueOf(response, "__Host-silent")).toBe("");
    const form = pawl.tokenRequests[0]!;
    expect(form.get("redirect_uri")).toBe(`${ROOT}/auth/callback`);
    expect(pawl.tokenHeaders[0]!.get("authorization")).toBe(
      `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
    );
    expect(pawl.tokenHeaders[0]!.get("cf-connecting-ip")).toBe("203.0.113.9");
  });

  it("refuses an ID token minted for another sign-in", async () => {
    const { authorize, pending } = await startSignIn();
    pawl.answerToken = async () =>
      Response.json({
        access_token: await pawl.sign(accessClaims()),
        id_token: await pawl.sign(accessClaims({ nonce: "someone-else" })),
      });
    const response = await callback(
      pending,
      `code=c&state=${authorize.searchParams.get("state")}`,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${ROOT}/?signin=failed`);
    expect(valueOf(response, "__Host-silent")).toBe("1");
    expect(valueOf(response, "__Host-session")).toBeNull();
  });
});

describe("who the gateway thinks is signed in", () => {
  it("reads the person from its own session", async () => {
    const token = await pawl.sign(accessClaims());
    expect(await session(`__Host-session=${token}`)).toEqual({
      authenticated: true,
      identity: {
        id: "user-1",
        email: "owner@product.test",
        username: "owner",
        role: "ADMIN",
      },
    });
  });

  it("refuses a token minted for another client", async () => {
    const token = await pawl.sign(accessClaims({ aud: ["desmyx", ISSUER] }));
    expect(await session(`__Host-session=${token}`)).toEqual({
      authenticated: false,
    });
  });

  it("says an ended session has ended rather than calling the person a guest", async () => {
    const token = await pawl.sign(
      accessClaims({ exp: Math.floor(Date.now() / 1000) - 5 }),
    );
    expect(await session(`__Host-session=${token}`)).toEqual({
      authenticated: false,
      reason: "expired",
    });
  });

  it("no longer knows anyone by the shared Pawl session", async () => {
    pawl.sharedSession = {
      identity: {
        id: "shared",
        email: "s@x.test",
        username: "s",
        role: "USER",
      },
      sessionId: "s",
      expiresAt: "9999-12-31T00:00:00.000Z",
    };
    expect(await session("__Secure-pawl_session=tok")).toEqual({
      authenticated: false,
    });
  });

  it("looks for a rotated key once, then fails closed", async () => {
    const token = await pawl.sign(accessClaims(), "rotated");
    expect(await session(`__Host-session=${token}`)).toEqual({
      authenticated: false,
    });
    expect(await session(`__Host-session=${token}`)).toEqual({
      authenticated: false,
    });
    expect(pawl.jwksFetches).toBe(2);
  });

  it("says Pawl's keys are unreachable instead of treating the person as a guest", async () => {
    pawl.keysDown = true;
    const token = await pawl.sign(accessClaims());
    const response = await app.request(
      `${ROOT}/api/session`,
      { headers: { cookie: `__Host-session=${token}` } },
      env,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "IDENTITY_UNAVAILABLE",
    });
  });

  it("refuses to run in production without a client of its own", () => {
    expect(() =>
      requireProviderInProduction({ ...env, OIDC_CLIENT_SECRET: undefined }),
    ).toThrow(/OIDC_CLIENT_SECRET/u);
    expect(() => requireProviderInProduction(env)).not.toThrow();
  });
});

describe("arriving at the cabinet", () => {
  function visit(cookie = "") {
    return app.request(
      `${ROOT}/`,
      {
        headers: {
          accept: "text/html",
          "sec-fetch-dest": "document",
          ...(cookie ? { cookie } : {}),
        },
      },
      env,
    );
  }

  it("asks Pawl once, silently, when Pawl has signed this browser in", async () => {
    const first = await visit("pawl-signed-in=1");
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toBe(
      "/auth/signin?returnTo=%2F&prompt=none",
    );
    expect(valueOf(first, "__Host-silent")).toBe("1");
    const again = await visit("pawl-signed-in=1; __Host-silent=1");
    expect(await again.text()).toBe("<html>cabinet</html>");
  });

  it("serves a visitor Pawl never signed in the cabinet without a detour", async () => {
    const response = await visit();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<html>cabinet</html>");
  });

  it("serves a link preview or a crawler the cabinet without a detour", async () => {
    const preview = await app.request(
      `${ROOT}/`,
      { headers: { accept: "text/html" } },
      env,
    );
    expect(await preview.text()).toBe("<html>cabinet</html>");
  });

  it("asks again when a session ended, even after asking once", async () => {
    const token = await pawl.sign(
      accessClaims({ exp: Math.floor(Date.now() / 1000) - 5 }),
    );
    const response = await visit(`__Host-silent=1; __Host-session=${token}`);
    expect(response.status).toBe(302);
  });

  it("serves the cabinet at once to a person already signed in", async () => {
    const token = await pawl.sign(accessClaims());
    const response = await visit(`__Host-session=${token}`);
    expect(await response.text()).toBe("<html>cabinet</html>");
  });
});

describe("keeping the session while Pawl's lasts", () => {
  function ended(overrides: Record<string, unknown> = {}) {
    return pawl.sign(
      accessClaims({
        exp: Math.floor(Date.now() / 1000) - 5,
        sid: "pawl-session",
        ...overrides,
      }),
    );
  }

  function renewWith(claims: Record<string, unknown> = {}) {
    pawl.answerRenew = async () =>
      Response.json({
        access_token: await pawl.sign(
          accessClaims({ role: "USER", ...claims }),
        ),
      });
  }

  it("renews an ended token in place and keeps the person signed in", async () => {
    renewWith();
    const token = await ended();
    const response = await app.request(
      `${ROOT}/api/session`,
      { headers: { cookie: `__Host-session=${token}` } },
      env,
    );
    expect(await response.json()).toMatchObject({
      authenticated: true,
      identity: { id: "user-1", role: "USER" },
    });
    expect(pawl.renewals).toEqual([token]);
    const renewed = valueOf(response, "__Host-session");
    expect(renewed).toBeTruthy();
    expect(renewed).not.toBe(token);
    expect(setCookie(response, "__Host-session")).toContain("HttpOnly");
  });

  it("serves the cabinet without the silent detour once renewed", async () => {
    renewWith();
    const response = await app.request(
      `${ROOT}/`,
      {
        headers: {
          accept: "text/html",
          "sec-fetch-dest": "document",
          cookie: `__Host-silent=1; __Host-session=${await ended()}`,
        },
      },
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<html>cabinet</html>");
    expect(valueOf(response, "__Host-session")).toBeTruthy();
  });

  it("leaves a session ended when Pawl's session has ended", async () => {
    const response = await app.request(
      `${ROOT}/api/session`,
      { headers: { cookie: `__Host-session=${await ended()}` } },
      env,
    );
    expect(await response.json()).toEqual({
      authenticated: false,
      reason: "expired",
    });
    expect(setCookie(response, "__Host-session")).toContain("Max-Age=0");
  });

  it("asks Pawl only about its own ended tokens", async () => {
    await session(`__Host-session=${await pawl.sign(accessClaims())}`);
    await session(`__Host-session=${await ended({ aud: ["desmyx", ISSUER] })}`);
    await session("");
    expect(pawl.renewals).toEqual([]);
  });

  it("does not renew for a static file", async () => {
    renewWith();
    await app.request(
      `${ROOT}/assets/site.js`,
      { headers: { cookie: `__Host-session=${await ended()}` } },
      env,
    );
    expect(pawl.renewals).toEqual([]);
  });

  it("asks Pawl whether the session behind a live token still lives when the cabinet reads it", async () => {
    renewWith({ role: "ADMIN", sid: "pawl-session" });
    const token = await pawl.sign(
      accessClaims({ role: "USER", sid: "pawl-session" }),
    );
    const response = await app.request(
      `${ROOT}/api/session`,
      { headers: { cookie: `__Host-session=${token}` } },
      env,
    );
    expect(await response.json()).toMatchObject({
      authenticated: true,
      identity: { id: "user-1", role: "ADMIN" },
    });
    expect(pawl.renewals).toEqual([token]);
    expect(valueOf(response, "__Host-session")).not.toBe(token);
  });

  it("says the session ended as soon as Pawl's has, and drops it", async () => {
    const token = await pawl.sign(accessClaims({ sid: "pawl-session" }));
    const response = await app.request(
      `${ROOT}/api/session`,
      { headers: { cookie: `__Host-session=${token}` } },
      env,
    );
    expect(await response.json()).toEqual({
      authenticated: false,
      reason: "expired",
    });
    expect(setCookie(response, "__Host-session")).toContain("Max-Age=0");
  });

  it("keeps a live session when Pawl cannot be asked", async () => {
    pawl.answerRenew = async () => new Response(null, { status: 503 });
    const token = await pawl.sign(accessClaims({ sid: "pawl-session" }));
    expect(await session(`__Host-session=${token}`)).toMatchObject({
      authenticated: true,
    });
  });

  it("takes a live token that names no Pawl session as it stands", async () => {
    expect(
      await session(`__Host-session=${await pawl.sign(accessClaims())}`),
    ).toMatchObject({ authenticated: true });
    expect(pawl.renewals).toEqual([]);
  });

  it("asks only when the cabinet reads the session, not on every call", async () => {
    const token = await pawl.sign(accessClaims({ sid: "pawl-session" }));
    await app.request(
      `${ROOT}/api/catalog`,
      { headers: { cookie: `__Host-session=${token}` } },
      env,
    );
    expect(pawl.renewals).toEqual([]);
  });
});

describe("signing out of the cabinet", () => {
  it("refuses a sign-out posted from another origin", async () => {
    const response = await app.request(
      `${ROOT}/auth/signout`,
      { method: "POST", headers: { origin: "https://evil.test" } },
      env,
    );
    expect(response.status).toBe(403);
  });

  it("ends the gateway's session and names the form that ends Pawl's", async () => {
    const response = await app.request(
      `${ROOT}/auth/signout`,
      { method: "POST", headers: { origin: ROOT } },
      env,
    );
    expect(valueOf(response, "__Host-session")).toBe("");
    expect(valueOf(response, "__Host-silent")).toBe("1");
    expect(await response.json()).toEqual({
      action: `${ISSUER}/oauth/logout`,
      fields: { client_id: CLIENT_ID, post_logout_redirect_uri: `${ROOT}/` },
    });
  });
});

describe("the estate, from the gateway's own session", () => {
  it("counts devices by account and tells each app who is asking", async () => {
    pawl.devices = { "user-1": 3 };
    const token = await pawl.sign(accessClaims());
    const response = await app.request(
      `${ROOT}/api/estate`,
      { headers: { cookie: `__Host-session=${token}` } },
      env,
    );
    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { tools: Record<string, unknown> }).tools
        .pass,
    ).toEqual({ count: 3, severity: null });
  });

  it("believes the caller Pass states, only on its internal host", async () => {
    pawl.devices = { "user-7": 1 };
    const stated = { "x-pawl-user": "user-7", "x-pawl-role": "USER" };
    const inside = await app.request(
      "http://gateway.internal/api/estate",
      { headers: stated },
      env,
    );
    expect(inside.status).toBe(200);
    const outside = await app.request(
      `${ROOT}/api/estate`,
      { headers: stated },
      env,
    );
    expect(outside.status).toBe(401);
  });

  it("no longer carries keypad codes to Pass for the cabinet", async () => {
    const reached: string[] = [];
    const answer = pawl.fetch;
    pawl.fetch = async (input, init) => {
      reached.push(
        new URL(input instanceof Request ? input.url : input).pathname,
      );
      return answer(input, init);
    };
    await app.request(
      `${ROOT}/api/auth/otp/start`,
      {
        method: "POST",
        headers: { origin: ROOT, "content-type": "application/json" },
        body: "{}",
      },
      env,
    );
    expect(reached).not.toContain("/api/auth/otp/start");
  });
});

describe("the person, on the gateway's hops to an app", () => {
  const MANIFEST = JSON.stringify({
    site: { name: "Example" },
    apps: [
      {
        key: "notes",
        label: "notes",
        title: "Notes",
        subdomain: "notes",
        service: "notes",
        proxy: ["/api/notes/"],
        apex: { resolve: "/internal/resolve/", fileSlugPrefix: "n_" },
      },
    ],
  });

  function withApp(seen: Request[]) {
    return {
      ...env,
      ESTATE_MANIFEST: MANIFEST,
      APP_NOTES: {
        fetch: async (input: Request | string, init?: RequestInit) => {
          const request =
            input instanceof Request ? input : new Request(input, init);
          seen.push(request);
          return new URL(request.url).pathname.startsWith("/internal/resolve/")
            ? new Response(null, { status: 404 })
            : new Response("ok");
        },
      },
    } as unknown as Env;
  }

  it("tells the app who the gateway knows is signed in, on proxy and file-page hops", async () => {
    const seen: Request[] = [];
    const token = await pawl.sign(accessClaims());
    const signedIn = { headers: { cookie: `__Host-session=${token}` } };
    await app.request(`${ROOT}/api/notes/list`, signedIn, withApp(seen));
    await app.request(
      `${ROOT}/n_abc`,
      { headers: { ...signedIn.headers, accept: "text/html" } },
      withApp(seen),
    );
    const hops = seen.filter(
      (request) => !new URL(request.url).pathname.startsWith("/internal/"),
    );
    expect(hops).toHaveLength(2);
    for (const request of hops) {
      expect(request.headers.get("x-pawl-user"), request.url).toBe("user-1");
      expect(request.headers.get("x-pawl-role"), request.url).toBe("ADMIN");
    }
  });

  it("signs a person in silently before showing them a file page on the apex", async () => {
    const seen: Request[] = [];
    const response = await app.request(
      `${ROOT}/n_abc`,
      {
        headers: {
          accept: "text/html",
          "sec-fetch-dest": "document",
          cookie: "pawl-signed-in=1",
        },
      },
      withApp(seen),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/auth/signin?returnTo=%2Fn_abc&prompt=none",
    );
  });

  it("names nobody when nobody is signed in", async () => {
    const seen: Request[] = [];
    await app.request(
      `${ROOT}/api/notes/list`,
      { headers: { "x-pawl-user": "victim" } },
      withApp(seen),
    );
    expect(seen[0]!.headers.get("x-pawl-user")).toBeNull();
  });
});
