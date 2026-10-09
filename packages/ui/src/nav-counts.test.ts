import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadNavCounts,
  loadOverview,
  navCountsFrom,
  readCache,
  writeCache,
  UNREADABLE_COUNTS,
} from "./nav-counts";
import type { Overview } from "./nav-counts";
import { displayFor, nameFor, padClass, severityFor } from "./indicator-view";

const overview: Overview = {
  role: "ADMIN",
  pass: { devices: 1 },
  link: { active: 12, files: 3, reported: 0, expiringSoon: 1 },
  attention: [],
};

describe("navCountsFrom", () => {
  it("reduces the overview to one count per tool", () => {
    const counts = navCountsFrom(overview);
    expect(counts.indicators.pass).toEqual({ count: 1, severity: null });
    expect(counts.indicators.link).toEqual({ count: 12, severity: "warn" });
    expect(Object.keys(counts.indicators)).toEqual(["pass", "link"]);
  });

  it("marks a tool warn when something merely expires soon", () => {
    const indicator = navCountsFrom(overview).indicators.link;
    expect(indicator).toEqual({ count: 12, severity: "warn" });
  });

  it("leaves a quiet tool unmarked", () => {
    const indicator = navCountsFrom(overview).indicators.pass;
    expect(indicator).toEqual({ count: 1, severity: null });
  });

  it("carries the viewer's role through", () => {
    expect(navCountsFrom(overview).role).toBe("ADMIN");
    expect(navCountsFrom({ ...overview, role: "USER" }).role).toBe("USER");
  });

  it("reports a failed tool's indicator as unknown, never as a zero count", () => {
    const counts = navCountsFrom({ ...overview, pass: null });
    expect(counts.indicators.pass).toBe("unknown");
    expect(counts.indicators.pass).not.toEqual({ count: 0, severity: null });
  });

  it("reports a failed but always-visible tool's indicator as unknown too", () => {
    expect(navCountsFrom({ ...overview, link: null }).indicators.link).toBe(
      "unknown",
    );
  });
});

const base: Overview = {
  role: "USER",
  pass: { devices: 2 },
  link: { active: 5, files: 1, reported: 0, expiringSoon: 0 },
  attention: [],
};

describe("indicator states", () => {
  it("never calls a user's own link block locked", () => {
    expect(navCountsFrom(base).indicators.link).toEqual({
      count: 5,
      severity: null,
    });
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

  it("treats a cached body missing role or attention as invalid, not as fresh", () => {
    sessionStorage.setItem(
      "pawl:overview",
      JSON.stringify({ at: Date.now(), overview: { pass: { devices: 1 } } }),
    );
    expect(readCache(Date.now())).toBeNull();
  });

  it("treats a missing 'at' as stale rather than fresh", () => {
    sessionStorage.setItem("pawl:overview", JSON.stringify({ overview }));
    expect(readCache(Date.now())).toBeNull();
  });

  it("never throws when the cached overview is missing a tool block entirely", () => {
    sessionStorage.setItem(
      "pawl:overview",
      JSON.stringify({
        at: Date.now(),
        overview: { role: "ADMIN", attention: [] },
      }),
    );
    expect(() => readCache(Date.now())).not.toThrow();
  });

  it("rejects a cached body whose link key is entirely absent, not merely null", () => {
    sessionStorage.setItem(
      "pawl:overview",
      JSON.stringify({
        at: Date.now(),
        overview: {
          role: "ADMIN",
          attention: [],
          pass: { devices: 1 },
        },
      }),
    );
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

  const answers = (body: unknown, status = 200): void => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status })),
    );
  };

  it("reports an unreadable estate rather than throwing when a 200 body is missing link", async () => {
    noCache();
    answers({
      role: "ADMIN",
      attention: [],
      pass: { devices: 1 },
    });
    await expect(loadNavCounts()).resolves.toEqual(UNREADABLE_COUNTS);
  });

  it("reads an estate that carries no pulse key, because monitoring left the platform", async () => {
    noCache();
    answers({
      role: "ADMIN",
      attention: [],
      pass: { devices: 1 },
      link: { active: 1, files: 0, reported: 0, expiringSoon: 0 },
    });
    await expect(loadNavCounts()).resolves.toEqual({
      role: "ADMIN",
      indicators: {
        pass: { count: 1, severity: null },
        link: { count: 1, severity: null },
      },
    });
  });

  it("reports an unreadable estate when the call fails outright", async () => {
    noCache();
    answers({ code: "UNAUTHENTICATED" }, 500);
    await expect(loadNavCounts()).resolves.toEqual(UNREADABLE_COUNTS);
  });

  it("reports an unreadable estate when the network refuses the call", async () => {
    noCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(loadNavCounts()).resolves.toEqual(UNREADABLE_COUNTS);
  });

  it("never resolves to the not-loaded state, which a header draws as silence", async () => {
    noCache();
    answers({ code: "UNAUTHENTICATED" }, 500);
    await expect(loadNavCounts()).resolves.not.toBeNull();
  });
});

describe("a header that cannot read the estate", () => {
  const TOOLS = ["pass", "link"] as const;

  it("draws every tool differently from a header that has not loaded yet", () => {
    for (const tool of TOOLS) {
      const unreadable = UNREADABLE_COUNTS.indicators[tool];
      const notLoaded = undefined;

      expect(displayFor(unreadable)).toBe("--");
      expect(displayFor(notLoaded)).toBeNull();
      expect(displayFor(unreadable)).not.toBe(displayFor(notLoaded));

      expect(severityFor(unreadable)).toBe("warn");
      expect(padClass("warn")).toContain("pw-pad-warn");
      expect(severityFor(notLoaded)).toBeNull();

      expect(nameFor(tool, "items", unreadable)).toBe(`${tool}, unknown`);
      expect(nameFor(tool, "items", unreadable)).not.toBe(
        nameFor(tool, "items", notLoaded),
      );
    }
  });

  it("never prints a count it did not measure", () => {
    for (const tool of TOOLS) {
      const printed = displayFor(UNREADABLE_COUNTS.indicators[tool]);
      expect(printed).not.toBe("0");
      expect(printed).not.toBeNull();
    }
  });

  it("alarms on every tool, because a total failure hides which are locked", () => {
    expect(Object.values(UNREADABLE_COUNTS.indicators)).toEqual([
      "unknown",
      "unknown",
    ]);
    expect(UNREADABLE_COUNTS.role).toBeNull();
  });
});

describe("loadOverview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the full overview so callers can read fields NavCounts drops, like link.reported", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify(overview), { status: 200 }),
      ),
    );
    await expect(loadOverview()).resolves.toEqual(overview);
  });
});
