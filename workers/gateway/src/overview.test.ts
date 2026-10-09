import { describe, expect, it } from "vitest";

import { buildEstate, readEstate, type AttentionItem } from "./overview";

const ORIGIN = "https://notes.example.test";

const item = (overrides: Partial<AttentionItem> = {}): AttentionItem => ({
  kind: "item-expiring",
  severity: "warn",
  title: "/abc",
  detail: "report.pdf",
  since: "2026-10-09T10:00:00.000Z",
  age: "remaining",
  href: `${ORIGIN}/`,
  ...overrides,
});

describe("readEstate", () => {
  it("accepts an answer of the contract's shape", () => {
    expect(
      readEstate({ count: 3, severity: null, attention: [item()] }, ORIGIN),
    ).toEqual({
      count: 3,
      severity: null,
      attention: [item()],
    });
  });

  it("refuses a negative, fractional or missing count rather than inventing one", () => {
    for (const count of [-1, 1.5, undefined, "3"]) {
      expect(
        readEstate({ count, severity: null, attention: [] }, ORIGIN),
      ).toBeNull();
    }
  });

  it("refuses a severity the contract does not name", () => {
    expect(
      readEstate({ count: 1, severity: "fine", attention: [] }, ORIGIN),
    ).toBeNull();
  });

  it("drops an attention item that links off the app's own origin", () => {
    const part = readEstate(
      {
        count: 1,
        severity: "warn",
        attention: [item({ href: "https://evil.test/" }), item()],
      },
      ORIGIN,
    );
    expect(part?.attention).toEqual([item()]);
  });

  it("drops an attention item of the wrong shape and keeps the rest", () => {
    const part = readEstate(
      { count: 1, severity: null, attention: [{ title: 1 }, item()] },
      ORIGIN,
    );
    expect(part?.attention).toHaveLength(1);
  });
});

describe("buildEstate", () => {
  it("reports each tool's count, a locked tool as locked, and an unreadable one as null", () => {
    const estate = buildEstate(
      "USER",
      { devices: 2 },
      {
        notes: { count: 4, severity: "warn", attention: [] },
        docs: "locked",
        other: null,
      },
    );
    expect(estate.tools).toEqual({
      pass: { count: 2, severity: null },
      notes: { count: 4, severity: "warn" },
      docs: "locked",
      other: null,
    });
  });

  it("never turns an unreadable pass into zero devices", () => {
    expect(buildEstate("USER", null, {}).tools.pass).toBeNull();
  });

  it("merges attention across apps, danger first, then the most urgent", () => {
    const now = Date.now();
    const estate = buildEstate(
      "ADMIN",
      { devices: 1 },
      {
        notes: {
          count: 1,
          severity: "warn",
          attention: [
            item({
              title: "later",
              age: "remaining",
              since: new Date(now + 5 * 60 * 60 * 1000).toISOString(),
            }),
            item({
              title: "soon",
              age: "remaining",
              since: new Date(now + 10 * 60 * 1000).toISOString(),
            }),
          ],
        },
        docs: {
          count: 1,
          severity: "danger",
          attention: [
            item({ title: "broken", severity: "danger", age: "elapsed" }),
          ],
        },
      },
    );
    expect(estate.attention.map((entry) => entry.title)).toEqual([
      "broken",
      "soon",
      "later",
    ]);
  });

  it("carries the viewer's role through", () => {
    expect(buildEstate("ADMIN", null, {}).role).toBe("ADMIN");
  });
});
