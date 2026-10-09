import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadNavCounts,
  loadOverview,
  navCountsFrom,
  readCache,
  unreadableCounts,
  writeCache,
} from "./nav-counts";
import type { Overview } from "./nav-counts";
import { displayFor, nameFor, padClass, severityFor } from "./indicator-view";

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

describe("the cache", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the estate under pawl:overview", () => {
    writeCache(overview, 1_000);
    expect(sessionStorage.getItem("pawl:overview")).not.toBeNull();
  });

  it("returns what was written inside the window", () => {
    const now = 1_000_000;
    writeCache(overview, now);
    expect(readCache(now + 59_000)).toEqual(overview);
  });

  it("returns null once the window has passed", () => {
    const now = 1_000_000;
    writeCache(overview, now);
    expect(readCache(now + 61_000)).toBeNull();
  });

  it("returns null rather than throwing when storage holds junk", () => {
    sessionStorage.setItem("pawl:overview", "{{{");
    expect(readCache(Date.now())).toBeNull();
  });

  it("treats a cached body missing role or attention as invalid, not as fresh", () => {
    sessionStorage.setItem(
      "pawl:overview",
      JSON.stringify({ at: Date.now(), overview: { tools: {} } }),
    );
    expect(readCache(Date.now())).toBeNull();
  });

  it("treats a cached body without a tools record as invalid", () => {
    sessionStorage.setItem(
      "pawl:overview",
      JSON.stringify({
        at: Date.now(),
        overview: { role: "ADMIN", attention: [], tools: [] },
      }),
    );
    expect(readCache(Date.now())).toBeNull();
  });

  it("treats a missing 'at' as stale rather than fresh", () => {
    sessionStorage.setItem("pawl:overview", JSON.stringify({ overview }));
    expect(readCache(Date.now())).toBeNull();
  });
});

describe("the cache without storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null rather than throwing when storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    });
    expect(readCache(Date.now())).toBeNull();
  });
});

describe("loadNavCounts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const noCache = (): void => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
  };

  it("reports every tool unknown when the estate cannot be read", async () => {
    noCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    await expect(loadNavCounts(KEYS)).resolves.toEqual(unreadableCounts(KEYS));
  });

  it("rejects a body without a tools record as unreadable", async () => {
    noCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ role: "ADMIN", attention: [] })),
    );
    await expect(loadNavCounts(KEYS)).resolves.toEqual(unreadableCounts(KEYS));
  });

  it("reads an estate of the contract's shape", async () => {
    noCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(overview)),
    );
    await expect(loadNavCounts(KEYS)).resolves.toEqual(
      navCountsFrom(overview, KEYS),
    );
  });

  it("reports an unreadable estate when the network refuses the call", async () => {
    noCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(loadNavCounts(KEYS)).resolves.toEqual(unreadableCounts(KEYS));
  });

  it("never resolves to the not-loaded state, which a header draws as silence", async () => {
    noCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    await expect(loadNavCounts(KEYS)).resolves.not.toBeNull();
  });
});

describe("a header that cannot read the estate", () => {
  const unreadable = unreadableCounts(KEYS);

  it("draws every tool differently from a header that has not loaded yet", () => {
    for (const tool of KEYS) {
      const indicator = unreadable.indicators[tool];
      const notLoaded = undefined;

      expect(displayFor(indicator)).toBe("--");
      expect(displayFor(notLoaded)).toBeNull();

      expect(severityFor(indicator)).toBe("warn");
      expect(padClass("warn")).toContain("pw-pad-warn");
      expect(severityFor(notLoaded)).toBeNull();

      expect(nameFor(tool, "items", indicator)).toBe(`${tool}, unknown`);
      expect(nameFor(tool, "items", indicator)).not.toBe(
        nameFor(tool, "items", notLoaded),
      );
    }
  });

  it("never prints a count it did not measure", () => {
    for (const tool of KEYS) {
      const printed = displayFor(unreadable.indicators[tool]);
      expect(printed).not.toBe("0");
      expect(printed).not.toBeNull();
    }
  });

  it("alarms on every tool, because a total failure hides which are locked", () => {
    expect(Object.values(unreadable.indicators)).toEqual([
      "unknown",
      "unknown",
      "unknown",
    ]);
    expect(unreadable.role).toBeNull();
  });
});

describe("loadOverview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the full overview so callers can read its attention list", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(overview)),
    );
    await expect(loadOverview()).resolves.toEqual(overview);
  });
});
