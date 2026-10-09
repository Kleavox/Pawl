import { describe, expect, it } from "vitest";
import {
  readCookie,
  type PassBinding,
  requirePassInProduction,
  verifyChallenge,
  verifySession,
} from "./index";

describe("readCookie", () => {
  it("reads an encoded cookie value", () => {
    const request = new Request("https://link.product.test", {
      headers: { cookie: "theme=dark; session=a%2Fb%3D" },
    });

    expect(readCookie(request, "session")).toBe("a/b=");
  });

  it("does not partially match cookie names", () => {
    const request = new Request("https://link.product.test", {
      headers: { cookie: "other_session=value" },
    });

    expect(readCookie(request, "session")).toBeNull();
  });
});

describe("standalone mode", () => {
  const request = new Request("https://link.product.test");

  it("hands out an admin session when there is no Pass to ask", async () => {
    const session = await verifySession(request, undefined);

    expect(session?.identity.role).toBe("ADMIN");
    expect(session?.identity.id).toBe("standalone");
  });

  it("refuses a challenge when there is no Pass to ask", async () => {
    expect(await verifyChallenge(request, undefined, "basic")).toBe(false);
  });

  it("throws in production when the Pass binding is missing", () => {
    expect(() =>
      requirePassInProduction({ ENVIRONMENT: "production" }),
    ).toThrow(/falls? open/u);
  });

  it("stays quiet outside production", () => {
    expect(() =>
      requirePassInProduction({ ENVIRONMENT: "development" }),
    ).not.toThrow();
  });

  it("stays quiet in production when the binding is there", () => {
    expect(() =>
      requirePassInProduction({
        ENVIRONMENT: "production",
        PASS: { fetch: async () => new Response(null) },
      }),
    ).not.toThrow();
  });
});

describe("the Pass seam", () => {
  function recordingPass(seen: Headers[]): PassBinding {
    return {
      fetch: async (_input, init) => {
        seen.push(new Headers(init?.headers));
        return new Response(null, { status: 401 });
      },
    };
  }

  it("asks Pass about the session cookie under the shared header", async () => {
    const seen: Headers[] = [];
    const request = new Request("https://link.product.test", {
      headers: { cookie: "__Secure-pawl_session=abc" },
    });
    await verifySession(request, recordingPass(seen));
    expect(seen.map((headers) => headers.get("x-pawl-session"))).toEqual([
      "abc",
    ]);
  });

  it("asks Pass about the challenge cookie under the shared header", async () => {
    const seen: Headers[] = [];
    const request = new Request("https://link.product.test", {
      headers: { cookie: "__Secure-pawl_verified=tok" },
    });
    await verifyChallenge(request, recordingPass(seen), "basic");
    expect(seen.map((headers) => headers.get("x-pawl-verification"))).toEqual([
      "tok",
    ]);
  });
});
