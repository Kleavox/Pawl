import { describe, expect, it, vi } from "vitest";

import { askCard, CARD_LIMITS, readCard } from "./cards";

const ORIGIN = "https://enroll.elsewhere.test";

const GOOD = {
  title: "Your DNS address",
  message: "Use it as the DNS-over-HTTPS address on your devices.",
  fields: [
    {
      label: "DNS address",
      value:
        "https://dns.elsewhere.test/dns-query/0123456789abcdef0123456789abcdef",
      copy: true,
    },
    {
      label: "Client ID",
      value: "0123456789abcdef0123456789abcdef",
      copy: true,
    },
  ],
  action: { label: "Detail", href: `${ORIGIN}/` },
};

describe("reading an app's card", () => {
  it("keeps a card within the limits, word for word", () => {
    expect(readCard(GOOD, ORIGIN)).toEqual(GOOD);
  });

  it("fills what an app may leave out", () => {
    expect(readCard({ title: "Waiting for approval" }, ORIGIN)).toEqual({
      title: "Waiting for approval",
      message: "",
      fields: [],
      action: null,
    });
    expect(
      readCard(
        { title: "T", fields: [{ label: "L", value: "V" }], action: null },
        ORIGIN,
      )?.fields,
    ).toEqual([{ label: "L", value: "V", copy: false }]);
  });

  it("refuses a card the machine could not show as the app meant it", () => {
    const long = (length: number) => "x".repeat(length);
    const broken: unknown[] = [
      null,
      "text",
      [],
      {},
      { ...GOOD, title: "" },
      { ...GOOD, title: long(CARD_LIMITS.title + 1) },
      { ...GOOD, title: "line\nbreak" },
      { ...GOOD, title: 7 },
      { ...GOOD, message: long(CARD_LIMITS.message + 1) },
      { ...GOOD, message: "bell\u0007" },
      { ...GOOD, fields: [...GOOD.fields, GOOD.fields[0]] },
      { ...GOOD, fields: "x" },
      { ...GOOD, fields: [{ label: "", value: "v" }] },
      { ...GOOD, fields: [{ label: long(CARD_LIMITS.label + 1), value: "v" }] },
      { ...GOOD, fields: [{ label: "l", value: long(CARD_LIMITS.value + 1) }] },
      { ...GOOD, fields: [{ label: "l", value: "v", copy: "yes" }] },
      { ...GOOD, action: { label: "Detail", href: "https://evil.test/" } },
      {
        ...GOOD,
        action: { label: "Detail", href: "http://enroll.elsewhere.test/" },
      },
      { ...GOOD, action: { label: "Detail", href: "javascript:alert(1)" } },
      {
        ...GOOD,
        action: { label: long(CARD_LIMITS.action + 1), href: ORIGIN },
      },
      { ...GOOD, action: { label: "Detail" } },
    ];
    for (const answer of broken) {
      expect(
        readCard(answer, ORIGIN),
        JSON.stringify(answer)?.slice(0, 80),
      ).toBeNull();
    }
  });
});

function answering(response: Response | Error) {
  return vi.fn(async (_input: string | Request, _init?: RequestInit) => {
    if (response instanceof Error) throw response;
    return response;
  });
}

describe("asking an app for its card", () => {
  it("sends the token to the app's card address and reads the answer", async () => {
    const fetch = answering(Response.json(GOOD));
    expect(await askCard(fetch, ORIGIN, "the-token")).toEqual(GOOD);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(`${ORIGIN}/.well-known/pawl/card`);
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer the-token",
    );
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("calls it unreadable on a redirect, an error, a huge or broken body, or no answer", async () => {
    const huge = JSON.stringify({
      ...GOOD,
      padding: "x".repeat(CARD_LIMITS.bytes),
    });
    for (const response of [
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.test/" },
      }),
      new Response("nope", { status: 500 }),
      new Response(null, { status: 204 }),
      new Response(huge, { status: 200 }),
      new Response("{not json", { status: 200 }),
      new Error("network down"),
    ]) {
      expect(await askCard(answering(response), ORIGIN, "t")).toBeNull();
    }
  });
});
