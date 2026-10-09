import { describe, expect, it } from "vitest";
import { displayHandle } from "./index";

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
