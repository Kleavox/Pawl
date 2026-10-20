import { describe, expect, it } from "vitest";

import { CODE39, code39Bars, code39Text, deliveryCode } from "./code39";

const VALUES = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. ";

function decode(pattern: string): string {
  const bars = [0, 2, 4, 6, 8].map((at) => pattern[at] === "w");
  const spaces = [1, 3, 5, 7].map((at) => pattern[at] === "w");
  const weight = [1, 2, 4, 7, 0].reduce(
    (sum, value, at) => sum + (bars[at] ? value : 0),
    0,
  );
  const inGroup = weight === 11 ? 0 : weight;
  const group = spaces.indexOf(true);
  const start = [30, 0, 10, 20][group]!;
  const value =
    group === 1 ? inGroup : start + (inGroup === 0 ? 10 : inGroup) - 1;
  return value === 39 ? "*" : (VALUES[value] ?? "?");
}

describe("Code 39", () => {
  it("encodes the table's known characters", () => {
    expect(CODE39["*"]).toBe("nwnnwnwnn");
    expect(CODE39["A"]).toBe("wnnnnwnnw");
    expect(CODE39["0"]).toBe("nnnwwnwnn");
    expect(CODE39["-"]).toBe("nwnnnnwnw");
  });

  it("gives every character nine elements, three of them wide", () => {
    for (const [char, pattern] of Object.entries(CODE39)) {
      expect(pattern, char).toMatch(/^[nw]{9}$/);
      expect(pattern.replaceAll("n", ""), char).toHaveLength(3);
    }
  });

  it("decodes back by the bar weights and the wide space's group", () => {
    for (const [char, pattern] of Object.entries(CODE39)) {
      if ("$/+%".includes(char)) continue;
      expect(decode(pattern), char).toBe(char);
    }
  });

  it("wraps the data in start and stop with a narrow gap between characters", () => {
    const bars = code39Bars("AB");
    expect(bars).toHaveLength(4 * 9 + 3);
    expect(bars[0]).toEqual({ bar: true, wide: false });
    expect(bars[9]).toEqual({ bar: false, wide: false });
  });

  it("refuses what Code 39 cannot hold", () => {
    expect(() => code39Bars("ab")).toThrow(/cannot hold/);
    expect(() => code39Bars("A*B")).toThrow(/cannot hold/);
  });

  it("brings any text into the set it can hold", () => {
    expect(code39Text("Café*Bar ☕")).toBe("CAF--BAR -");
    expect(code39Text("x".repeat(30))).toHaveLength(16);
  });

  it("codes a delivery by its bay and the time printed on it", () => {
    expect(deliveryCode("7", new Date(2026, 9, 19, 14, 3, 59))).toBe("7-1403");
  });
});
