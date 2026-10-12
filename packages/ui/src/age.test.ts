import { describe, expect, it } from "vitest";
import { formatAge } from "./age";

describe("formatAge", () => {
  const now = new Date("2026-08-25T18:00:00Z");

  it("reports whole hours below a day", () => {
    expect(formatAge("2026-08-25T16:00:00Z", now)).toBe("2h");
  });

  it("reports minutes below an hour", () => {
    expect(formatAge("2026-08-25T17:43:00Z", now)).toBe("17m");
  });

  it("reports days beyond twenty-four hours", () => {
    expect(formatAge("2026-08-22T18:00:00Z", now)).toBe("3d");
  });

  it("floors to a minute rather than showing seconds", () => {
    expect(formatAge("2026-08-25T17:59:30Z", now)).toBe("0m");
  });

  it("returns a dash for an unparseable timestamp", () => {
    expect(formatAge("not a date", now)).toBe("--");
  });

  it("returns a dash rather than a negative age for a future timestamp", () => {
    expect(formatAge("2026-08-25T19:00:00Z", now)).toBe("--");
  });

  it("reports the remaining time until a future timestamp when asked for remaining", () => {
    expect(formatAge("2026-08-26T00:00:00Z", now, "remaining")).toBe("6h");
  });

  it("returns a dash for remaining time on a timestamp already in the past", () => {
    expect(formatAge("2026-08-25T16:00:00Z", now, "remaining")).toBe("--");
  });
});
