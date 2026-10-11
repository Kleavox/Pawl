import { describe, expect, it } from "vitest";
import {
  readCookie,
  type PassBinding,
  STANDALONE_SESSION,
  verifyChallenge,
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
  it("names the admin a deployment with no Pass runs as", () => {
    expect(STANDALONE_SESSION.identity).toMatchObject({
      id: "standalone",
      role: "ADMIN",
    });
  });

  it("refuses a challenge when there is no Pass to ask", async () => {
    const request = new Request("https://link.product.test");
    expect(await verifyChallenge(request, undefined, "basic")).toBe(false);
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
