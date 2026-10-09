import { publicHost } from "@pawl/config";
import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import { clearSessionCookie, makeSessionCookie } from "./cookies";

const env = {
  ROOT_DOMAIN: "product.test",
} as Env;

describe("session cookies", () => {
  it("scopes production sessions to every subdomain of the root domain", () => {
    const cookie = makeSessionCookie(
      new Request("https://pass.product.test/api/login"),
      env,
      "secret",
    );

    expect(cookie).toContain("__Secure-pawl_session=secret");
    expect(cookie).toContain("Domain=.product.test");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("does not attach the production domain during local development", () => {
    const cookie = makeSessionCookie(
      new Request("http://localhost:8787/api/login"),
      env,
      "secret",
    );

    expect(cookie).not.toContain("Domain=");
  });

  it("emits no domain at all when it is handed an internal hostname", () => {
    const cookie = makeSessionCookie(
      new Request("http://pass.internal/api/auth/otp/verify"),
      env,
      "secret",
    );

    expect(cookie).not.toContain("Domain=");
  });

  it("scopes a session minted on the proxied auth path to every origin under the root domain", () => {
    const cookie = makeSessionCookie(
      new Request("https://pass.product.test/api/auth/otp/verify"),
      env,
      "secret",
    );

    expect(cookie).toContain("Domain=.product.test");
  });

  it("scopes the session for exactly the hostname the gateway's rewrite produces", () => {
    const rootDomain = env.ROOT_DOMAIN;
    const cookie = makeSessionCookie(
      new Request(
        `https://${publicHost(rootDomain, "pass")}/api/auth/otp/verify`,
      ),
      env,
      "secret",
    );

    expect(cookie).toContain(`Domain=.${rootDomain}`);
  });

  it("clears the same cookie", () => {
    expect(
      clearSessionCookie(
        new Request("https://pass.product.test/api/logout"),
        env,
      ),
    ).toContain("Max-Age=0");
  });
});
