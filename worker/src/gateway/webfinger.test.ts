import { describe, expect, it } from "vitest";

import { ISSUER_REL, webfinger } from "./webfinger";

const BAYS = [
  { code: "2", access: "public" as const },
  { code: "7", access: "visitor" as const },
];

let read = 0;

const BASE = {
  hosts: ["example.com", "paw.example.com"],
  root: "https://example.com",
  issuer: "https://paw.example.com",
  bays: async () => {
    read += 1;
    return BAYS;
  },
};

function asked(query: string) {
  return webfinger({
    ...BASE,
    url: new URL(`https://example.com/.well-known/webfinger${query}`),
  });
}

async function jrd(query: string): Promise<{
  subject: string;
  properties?: Record<string, string>;
  links: { rel: string; href: string }[];
}> {
  return (await (await asked(query)).json()) as never;
}

describe("WebFinger (RFC 7033)", () => {
  it("points an account on Pawl's hosts at the OpenID Connect issuer, as section 3.1 shows", async () => {
    read = 0;
    const response = await asked(
      `?resource=${encodeURIComponent("acct:carol@example.com")}&rel=${encodeURIComponent(ISSUER_REL)}`,
    );
    expect(read).toBe(0);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/jrd+json");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toEqual({
      subject: "acct:carol@example.com",
      links: [{ rel: ISSUER_REL, href: "https://paw.example.com" }],
    });
  });

  it("answers finger coke like CMU's board: every bay, as a guest sees it", async () => {
    const answer = await jrd("?resource=acct:coke@example.com");
    expect(answer.subject).toBe("acct:coke@example.com");
    expect(answer.properties).toEqual({
      "https://example.com/#bay-1": "EMPTY",
      "https://example.com/#bay-2": "READY",
      "https://example.com/#bay-3": "EMPTY",
      "https://example.com/#bay-4": "EMPTY",
      "https://example.com/#bay-5": "EMPTY",
      "https://example.com/#bay-6": "EMPTY",
      "https://example.com/#bay-7": "LOCKED",
      "https://example.com/#bay-8": "EMPTY",
      "https://example.com/#bay-9": "EMPTY",
    });
    expect(answer.links).toEqual([
      { rel: ISSUER_REL, href: "https://paw.example.com" },
    ]);
  });

  it("matches the host however it is written", async () => {
    for (const resource of [
      "acct:carol@EXAMPLE.COM",
      "ACCT:carol@example.com",
      "acct:carol@paw.example.com",
      "acct:carol%40home@example.com",
      "https://example.com/people/carol",
      "https://Example.com:443/",
    ]) {
      const response = await asked(`?resource=${encodeURIComponent(resource)}`);
      expect(response.status, resource).toBe(200);
    }
  });

  it("is unable to match a resource elsewhere or of another kind", async () => {
    for (const resource of [
      "acct:carol@elsewhere.example",
      "https://elsewhere.example/",
      "mailto:carol@example.com",
    ]) {
      const response = await asked(`?resource=${encodeURIComponent(resource)}`);
      expect(response.status, resource).toBe(404);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }
  });

  it("calls a request bad when the resource is missing, doubled or malformed", async () => {
    for (const query of [
      "",
      "?resource=",
      "?resource=acct:a@example.com&resource=acct:b@example.com",
      "?resource=acct:nobody",
      "?resource=carol",
      `?resource=${encodeURIComponent("https://")}`,
    ]) {
      const response = await asked(query);
      expect(response.status, query).toBe(400);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }
  });
});
