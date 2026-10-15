import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { app, type Env } from "./app";
import {
  accessClaims,
  CLIENT_ID,
  fakePawl,
  ISSUER,
  type FakePawl,
} from "./session/pawl.testkit";

const MANIFEST = readFileSync(
  new URL("../../../tooling/e2e/fixture/estate.json", import.meta.url),
  "utf8",
);

const DNS = {
  key: "dns",
  label: "dns",
  title: "DNS",
  origin: "https://enroll.elsewhere.test",
  access: "visitor",
  card: true,
};

const CARD = {
  title: "Your DNS address",
  message: "Use it on your devices.",
  fields: [{ label: "Client ID", value: "0123456789abcdef", copy: true }],
  action: { label: "Detail", href: "https://enroll.elsewhere.test/" },
};

let pawl: FakePawl;

function env(): Env {
  return {
    PASS: pawl,
    OIDC_ISSUER: ISSUER,
    OIDC_CLIENT_ID: CLIENT_ID,
    ASSETS: { fetch: vi.fn() },
    PUBLIC_ORIGIN: "https://product.test",
    ESTATE_MANIFEST: MANIFEST,
  } as unknown as Env;
}

async function session(role: "ADMIN" | "USER" = "USER"): Promise<string> {
  return `__Host-session=${await pawl.sign(accessClaims({ role, sub: "user-1" }))}`;
}

beforeEach(async () => {
  pawl = await fakePawl();
  pawl.outsideApps = [DNS];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the cabinet's catalog at runtime", () => {
  it("lists the manifest's bays and the outside apps, uncached", async () => {
    const response = await app.request(
      "https://product.test/api/catalog",
      {},
      env(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const { bays } = (await response.json()) as {
      bays: { key: string; href: string; card: boolean }[];
    };
    expect(bays.map((bay) => bay.key).sort()).toEqual(["dns", "docs", "notes"]);
    expect(bays.find((bay) => bay.key === "dns")).toMatchObject({
      href: "https://enroll.elsewhere.test",
      card: true,
    });
  });

  it("falls back to the manifest alone when Pawl cannot list them or they clash", async () => {
    for (const outside of [null, [{ ...DNS, key: "notes", label: "notes" }]]) {
      pawl.outsideApps = outside;
      const response = await app.request(
        "https://product.test/api/catalog",
        {},
        env(),
      );
      expect(response.status).toBe(200);
      const { bays } = (await response.json()) as { bays: { key: string }[] };
      expect(bays.map((bay) => bay.key).sort()).toEqual(["docs", "notes"]);
    }
  });
});

function askCard(cookie: string | null, key = "dns") {
  return app.request(
    `https://product.test/api/apps/${key}/card`,
    { headers: cookie ? { cookie } : {} },
    env(),
  );
}

describe("an outside app's card through the gateway", () => {
  it("asks for a session first", async () => {
    expect((await askCard(null)).status).toBe(401);
  });

  it("knows only card apps and keeps an owner's bay from a visitor", async () => {
    expect((await askCard(await session(), "nope")).status).toBe(404);
    expect((await askCard(await session(), "notes")).status).toBe(404);
    pawl.outsideApps = [{ ...DNS, access: "owner" }];
    expect((await askCard(await session("USER"))).status).toBe(403);
    expect(pawl.cardTokens).toHaveLength(0);
  });

  it("offers Pawl's connect page when the person has not connected the app", async () => {
    pawl.answerCardToken = () =>
      Response.json(
        { code: "CONSENT_REQUIRED", clientId: "dns" },
        { status: 409 },
      );
    const response = await askCard(await session());
    expect(response.status).toBe(409);
    const { code, connect } = (await response.json()) as {
      code: string;
      connect: string;
    };
    expect(code).toBe("CONSENT_REQUIRED");
    const target = new URL(connect);
    expect(target.origin).toBe("https://paw.product.test");
    expect(target.pathname).toBe("/oauth/connect");
    expect(target.searchParams.get("client_id")).toBe("dns");
    expect(target.searchParams.get("returnTo")).toBe("https://product.test/");
  });

  it("asks Pawl for a token for this person, then the app for its card", async () => {
    pawl.answerCardToken = () =>
      Response.json({
        token: "card-token",
        origin: DNS.origin,
        clientId: "dns",
      });
    const outbound = vi.fn(async () => Response.json(CARD));
    vi.stubGlobal("fetch", outbound);
    const response = await askCard(await session());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      card: { ...CARD, message: CARD.message },
    });
    expect(pawl.cardTokens[0]?.searchParams.get("user")).toBe("user-1");
    expect(pawl.cardTokens[0]?.searchParams.get("key")).toBe("dns");
    const [url, init] = outbound.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://enroll.elsewhere.test/.well-known/pawl/card");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer card-token",
    );
  });

  it("says the app did not answer rather than showing an empty card", async () => {
    pawl.answerCardToken = () =>
      Response.json({ token: "t", origin: DNS.origin, clientId: "dns" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 })),
    );
    const response = await askCard(await session());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: "APP_UNREADABLE" });
  });

  it("says Pawl is unavailable when it cannot list the apps", async () => {
    pawl.outsideApps = null;
    expect((await askCard(await session())).status).toBe(503);
  });
});
