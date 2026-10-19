import { afterEach, describe, expect, it, vi } from "vitest";

import { readCardFor } from "./card";

const CARD = {
  title: "Your DNS address",
  message: "Use it on your devices.",
  fields: [{ label: "Client ID", value: "0123", copy: true }],
  action: { label: "Detail", href: "https://enroll.elsewhere.test/" },
};

function answering(status: number, body: unknown) {
  const fetch = vi.fn(async (_input: string, _init?: RequestInit) =>
    Response.json(body, { status }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("reading a card through the cabinet's own origin", () => {
  it("asks the gateway for the app's card with the cabinet's session, for a limited time", async () => {
    const fetch = answering(200, { card: CARD });
    expect(await readCardFor("dns")).toEqual({ kind: "shown", card: CARD });
    expect(fetch).toHaveBeenCalledWith("/api/apps/dns/card", {
      credentials: "include",
      signal: expect.any(AbortSignal),
    });
  });

  it("offers Pawl's connect page when the app is not connected yet", async () => {
    answering(409, {
      code: "CONSENT_REQUIRED",
      connect: "https://paw.example.test/oauth/connect?client_id=dns",
    });
    expect(await readCardFor("dns")).toEqual({
      kind: "connect",
      href: "https://paw.example.test/oauth/connect?client_id=dns",
    });
  });

  it("knows an ended session from an app that did not answer", async () => {
    answering(401, { code: "SESSION_EXPIRED" });
    expect(await readCardFor("dns")).toEqual({ kind: "expired" });
    for (const [status, body] of [
      [502, { code: "APP_UNREADABLE" }],
      [503, {}],
      [200, { card: { title: 7 } }],
      [200, { nope: true }],
      [409, { code: "CONSENT_REQUIRED" }],
    ] as const) {
      answering(status, body);
      expect(await readCardFor("dns"), `${status}`).toEqual({
        kind: "unreadable",
      });
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await readCardFor("dns")).toEqual({ kind: "unreadable" });
  });

  it("asks for the key it was given, safely encoded", async () => {
    const fetch = answering(200, { card: CARD });
    await readCardFor("a/b");
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/apps/a%2Fb/card");
  });
});
