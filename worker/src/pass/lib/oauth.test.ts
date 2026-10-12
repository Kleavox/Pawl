import { describe, expect, it, vi } from "vitest";

import type { Env } from "../env";
import { beginOAuth, finishOAuth, safeReturnTo } from "./oauth";

const env = {
  PUBLIC_ORIGIN: "https://pass.product.test",
  ROOT_DOMAIN: "product.test",
} as Env;

function oauthEnv() {
  const sessions = { get: vi.fn(), put: vi.fn(), delete: vi.fn() };
  return {
    sessions,
    env: {
      PUBLIC_ORIGIN: "https://pass.product.test",
      ROOT_DOMAIN: "product.test",
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      SESSIONS: sessions,
    } as unknown as Env,
  };
}

describe("OAuth return destinations", () => {
  it("accepts canonical hosts", () => {
    expect(safeReturnTo("https://link.product.test/files", env)).toBe(
      "https://link.product.test/files",
    );
    expect(safeReturnTo("https://product.test/account", env)).toBe(
      "https://product.test/account",
    );
  });

  it("rejects external and insecure destinations", () => {
    expect(safeReturnTo("https://product.test.attacker.example", env)).toBe(
      env.PUBLIC_ORIGIN,
    );
    expect(safeReturnTo("http://link.product.test", env)).toBe(
      env.PUBLIC_ORIGIN,
    );
  });
});

describe("OAuth state cookie binding", () => {
  it("binds the flow to a state cookie matching the URL state", async () => {
    const { env: beginEnv, sessions } = oauthEnv();

    const response = await beginOAuth(
      new Request("https://pass.product.test/api/oauth/google"),
      beginEnv,
      "google",
    );

    expect(response.status).toBe(302);
    const state = new URL(
      response.headers.get("location") ?? "",
    ).searchParams.get("state");
    expect(state).toBeTruthy();

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`__Secure-pawl_oauth=${state}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/api/oauth");
    expect(sessions.put).toHaveBeenCalledWith(
      `oauth:${state}`,
      expect.any(String),
      expect.objectContaining({ expirationTtl: expect.any(Number) }),
    );
  });

  it("rejects a callback with no state cookie before touching KV", async () => {
    const { env: finishEnv, sessions } = oauthEnv();
    sessions.get.mockResolvedValue({
      provider: "google",
      returnTo: "https://product.test",
    });

    const result = await finishOAuth(
      new Request(
        "https://pass.product.test/api/oauth/callback/google?state=abc&code=xyz",
      ),
      finishEnv,
      "google",
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toContain(
      "oauthError=oauth_state_expired",
    );
    expect(sessions.get).not.toHaveBeenCalled();
  });

  it("rejects a callback whose state cookie does not match", async () => {
    const { env: finishEnv, sessions } = oauthEnv();
    sessions.get.mockResolvedValue({
      provider: "google",
      returnTo: "https://product.test",
    });

    const result = await finishOAuth(
      new Request(
        "https://pass.product.test/api/oauth/callback/google?state=abc&code=xyz",
        { headers: { cookie: "__Secure-pawl_oauth=different" } },
      ),
      finishEnv,
      "google",
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toContain(
      "oauthError=oauth_state_expired",
    );
    expect(sessions.get).not.toHaveBeenCalled();
  });

  it("passes the cookie gate when state matches, then validates KV", async () => {
    const { env: finishEnv, sessions } = oauthEnv();
    sessions.get.mockResolvedValue(null);

    const result = await finishOAuth(
      new Request(
        "https://pass.product.test/api/oauth/callback/google?state=abc&code=xyz",
        { headers: { cookie: "__Secure-pawl_oauth=abc" } },
      ),
      finishEnv,
      "google",
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toContain(
      "oauthError=oauth_state_expired",
    );
    expect(sessions.get).toHaveBeenCalledWith("oauth:abc", "json");
  });
});
