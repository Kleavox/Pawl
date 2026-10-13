import { describe, expect, it } from "vitest";

import { departure } from "./depart";

const HERE = "https://paw.example.com/?returnTo=x";
const ROOT = "https://example.com";

describe("departure", () => {
  it("returns to the machine on the screen framing, so the pull-back starts where this page ends", () => {
    expect(departure("https://example.com/", HERE, ROOT)).toEqual({
      href: "https://example.com/#cam=screen",
      toMachine: true,
    });
    expect(
      departure("https://example.com/auth/silent?next=%2F", HERE, ROOT),
    ).toEqual({
      href: "https://example.com/auth/silent?next=%2F#cam=screen",
      toMachine: true,
    });
  });

  it("goes anywhere else exactly as asked, with no hint for an app or a provider to carry", () => {
    expect(
      departure("https://notes.example.com/callback?code=1", HERE, ROOT),
    ).toEqual({
      href: "https://notes.example.com/callback?code=1",
      toMachine: false,
    });
    expect(departure("/oauth/authorize?client_id=a", HERE, ROOT)).toEqual({
      href: "https://paw.example.com/oauth/authorize?client_id=a",
      toMachine: false,
    });
  });
});
