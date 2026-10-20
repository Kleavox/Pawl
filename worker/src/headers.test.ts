import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { ownHeaders } from "./headers";

function app(skip?: (path: string) => boolean) {
  const served = new Hono();
  served.use(
    "*",
    ownHeaders({
      referrerPolicy: "same-origin",
      skip: skip && ((context) => skip(context.req.path)),
    }),
  );
  served.get(
    "/page",
    () =>
      new Response("<p>page</p>", {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=0, must-revalidate",
        },
      }),
  );
  served.get("/bare", (context) => context.html("<p>bare</p>"));
  served.get(
    "/kept",
    () =>
      new Response("<p>kept</p>", {
        headers: {
          "content-type": "text/html",
          "cache-control": "no-store, no-transform",
          "content-security-policy": "default-src 'none'",
        },
      }),
  );
  served.get("/json", (context) => context.json({ ok: true }));
  served.get("/moved", (context) => context.redirect("/page", 302));
  served.get("/same", () => new Response(null, { status: 304 }));
  served.get(
    "/app",
    () =>
      new Response("<p>app</p>", {
        headers: { "content-type": "text/html", "x-app": "1" },
      }),
  );
  return served;
}

const SAFE = {
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

function safe(response: Response): Record<string, string | null> {
  return Object.fromEntries(
    Object.keys(SAFE).map((name) => [name, response.headers.get(name)]),
  );
}

describe("Pawl's own answers", () => {
  it("send the safe headers on a page and leave its caching to the edge's compression", async () => {
    const response = await app().request("/page");
    expect(safe(response)).toEqual(SAFE);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(await response.text()).toBe("<p>page</p>");
  });

  it("add no caching rule to a page that named none", async () => {
    const response = await app().request("/bare");
    expect(response.headers.get("cache-control")).toBeNull();
  });

  it("keep a page's own policy", async () => {
    const response = await app().request("/kept");
    expect(response.headers.get("cache-control")).toBe(
      "no-store, no-transform",
    );
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'",
    );
  });

  it("send the safe headers on JSON, which keeps its caching", async () => {
    const response = await app().request("/json");
    expect(safe(response)).toEqual(SAFE);
    expect(response.headers.get("cache-control")).toBeNull();
    expect(await response.json()).toEqual({ ok: true });
  });

  it("keep a redirect's status and place, and a 304's empty body", async () => {
    const moved = await app().request("/moved");
    expect(moved.status).toBe(302);
    expect(moved.headers.get("location")).toBe("/page");
    expect(safe(moved)).toEqual(SAFE);
    const same = await app().request("/same");
    expect(same.status).toBe(304);
    expect(same.body).toBeNull();
  });

  it("leave an answer it is told to skip exactly as it came", async () => {
    const response = await app((path) => path === "/app").request("/app");
    expect(safe(response)).toEqual(
      Object.fromEntries(Object.keys(SAFE).map((name) => [name, null])),
    );
    expect(response.headers.get("cache-control")).toBeNull();
    expect(response.headers.get("x-app")).toBe("1");
  });
});
