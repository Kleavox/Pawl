import { publicHost } from "@pawl/config";
import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import {
  clearSessionCookie,
  makeSessionCookie,
  makeVerificationCookie,
} from "./cookies";

const env = {
  ROOT_DOMAIN: "product.test",
} as Env;

describe("session cookies", () => {
  it("keep the Pawl session on Pawl's own host, where no other app can read it", () => {
    const cookie = makeSessionCookie(
      new Request(`https://${publicHost("product.test", "pass")}/api/login`),
      env,
      "secret",
    );

    expect(cookie).toContain("__Secure-pawl_session=secret");
    expect(cookie).not.toContain("Domain=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("stay host-only on the codes path the cabinet calls, too", () => {
    const cookie = makeSessionCookie(
      new Request("https://paw.product.test/api/auth/otp/verify"),
      env,
      "secret",
    );

    expect(cookie).not.toContain("Domain=");
  });

  it("emit no domain during local development", () => {
    const cookie = makeSessionCookie(
      new Request("http://localhost:8787/api/login"),
      env,
      "secret",
    );

    expect(cookie).not.toContain("Domain=");
  });

  it("clear the same cookie", () => {
    const cleared = clearSessionCookie(
      new Request("https://paw.product.test/api/logout"),
      env,
    );
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).not.toContain("Domain=");
  });
});

describe("verification cookies", () => {
  it("still reach every app under the root domain, because they prove a challenge, not a person", () => {
    const cookie = makeVerificationCookie(
      new Request("https://paw.product.test/api/challenge"),
      env,
      "token",
      600,
    );

    expect(cookie).toContain("Domain=.product.test");
  });
});
