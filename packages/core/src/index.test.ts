import { describe, expect, it } from "vitest";
import { displayHandle, isFileSlug, isReservedSlug } from "./index";

describe("isReservedSlug", () => {
  it("normalizes case and whitespace", () => {
    expect(isReservedSlug("  API ")).toBe(true);
  });

  it("allows normal short-link slugs", () => {
    expect(isReservedSlug("launch-notes")).toBe(false);
  });

  it("reserves the hostnames that exist or are planned", () => {
    for (const slug of ["paw", "pawl", "thy", "des", "kry"]) {
      expect(isReservedSlug(slug), slug).toBe(true);
    }
  });

  it("never reserves sig, which was planned and abandoned", () => {
    expect(isReservedSlug("sig")).toBe(false);
  });

  it("identifies the isolated file namespace", () => {
    expect(isFileSlug("f_JG2nV6-pQ9")).toBe(true);
    expect(isFileSlug("launch-notes")).toBe(false);
    expect(isFileSlug("f_short")).toBe(false);
  });
});

describe("displayHandle", () => {
  it("returns the username when present", () => {
    expect(displayHandle("ada_lovelace")).toBe("ada_lovelace");
  });

  it("falls back to the email local part", () => {
    expect(displayHandle(null, "norm@example.com")).toBe("norm");
    expect(displayHandle("", "norm@example.com")).toBe("norm");
  });

  it("falls back to a generic label", () => {
    expect(displayHandle(null, null)).toBe("Account");
    expect(displayHandle(undefined, undefined)).toBe("Account");
  });
});
