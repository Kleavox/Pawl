import { describe, expect, it } from "vitest";
import { navCountsFrom, unreadableCounts } from "./nav-counts";
import type { Overview } from "./nav-counts";

const KEYS = ["pass", "notes", "docs"];

const overview: Overview = {
  role: "ADMIN",
  tools: {
    pass: { count: 1, severity: null },
    notes: { count: 12, severity: "warn" },
    docs: "locked",
  },
  attention: [],
};

describe("navCountsFrom", () => {
  it("gives one indicator per tool the page shows", () => {
    expect(navCountsFrom(overview, KEYS).indicators).toEqual({
      pass: { count: 1, severity: null },
      notes: { count: 12, severity: "warn" },
      docs: "locked",
    });
  });

  it("calls a tool the estate did not mention unknown, never zero", () => {
    expect(navCountsFrom(overview, [...KEYS, "later"]).indicators.later).toBe(
      "unknown",
    );
  });

  it("calls a null block unknown", () => {
    expect(
      navCountsFrom({ ...overview, tools: { pass: null } }, ["pass"]).indicators
        .pass,
    ).toBe("unknown");
  });

  it("carries the viewer's role through", () => {
    expect(navCountsFrom(overview, KEYS).role).toBe("ADMIN");
    expect(navCountsFrom({ ...overview, role: "USER" }, KEYS).role).toBe(
      "USER",
    );
  });
});

describe("an estate that cannot be read", () => {
  const unreadable = unreadableCounts(KEYS);

  it("alarms on every tool, because a total failure hides which are locked", () => {
    expect(Object.values(unreadable.indicators)).toEqual([
      "unknown",
      "unknown",
      "unknown",
    ]);
    expect(unreadable.role).toBeNull();
  });
});
