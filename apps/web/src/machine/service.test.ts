import { LCD_FIT } from "@pawl/ui";
import { describe, expect, it } from "vitest";

import { FAULT } from "./copy";

import {
  SECRET_GAP_MS,
  secretStep,
  serviceCopy,
  serviceCredit,
  type Heard,
} from "./service";

function heard(keys: [string, number][]): boolean {
  let seen: Heard[] = [];
  let open = false;
  for (const [key, at] of keys) {
    const next = secretStep(seen, key, at);
    seen = next.seen;
    open = next.open;
  }
  return open;
}

describe("the 4-2-3-1 secret", () => {
  it("opens on 4, 2, 3, 1, each inside the gap", () => {
    expect(
      heard([
        ["4", 0],
        ["2", 500],
        ["3", 1000],
        ["1", 1000 + SECRET_GAP_MS],
      ]),
    ).toBe(true);
  });

  it("stays shut for a slow press, a wrong order, or three keys", () => {
    expect(
      heard([
        ["4", 0],
        ["2", 500],
        ["3", 500 + SECRET_GAP_MS + 100],
        ["1", 600 + SECRET_GAP_MS + 100],
      ]),
    ).toBe(false);
    expect(
      heard([
        ["4", 0],
        ["3", 100],
        ["2", 200],
        ["1", 300],
      ]),
    ).toBe(false);
    expect(
      heard([
        ["2", 0],
        ["3", 100],
        ["1", 200],
      ]),
    ).toBe(false);
  });

  it("starts again on a fresh 4", () => {
    expect(
      heard([
        ["4", 0],
        ["2", 100],
        ["4", 200],
        ["2", 300],
        ["3", 400],
        ["1", 500],
      ]),
    ).toBe(true);
  });
});

describe("the service menu", () => {
  it("names each item and what it holds", () => {
    const facts = { fault: null, vends: 2 };
    expect(serviceCopy(1, facts)).toEqual({
      main: "SERVICE 1 ERROR",
      sub: "NONE",
    });
    expect(serviceCopy(1, { fault: "RELEASE FAILED", vends: 0 })).toEqual({
      main: "SERVICE 1 ERROR",
      sub: "RELEASE FAILED",
    });
    expect(serviceCopy(2, facts)).toEqual({
      main: "SERVICE 2 SALE",
      sub: "2 SOLD THIS PAGE",
    });
    expect(serviceCopy(3, facts)).toEqual({
      main: "SERVICE 3 CASH",
      sub: "0.00 · FREE VEND",
    });
    expect(serviceCopy(4, facts)).toEqual({
      main: "SERVICE 4 TEST",
      sub: "GO RUNS LAMP TEST",
    });
    expect(serviceCopy(5, facts)).toEqual({
      main: "SERVICE 5 AUDIT",
      sub: "GO PRINTS THE AUDIT",
    });
  });

  it("shows the item on the credit display", () => {
    expect([1, 2, 3, 4, 5].map(serviceCredit)).toEqual([
      "SEr1",
      "SEr2",
      "SEr3",
      "SEr4",
      "SEr5",
    ]);
  });
});

describe("the service menu on the LCD", () => {
  it("fits every item on one line of the LCD, the longest fault and count included", () => {
    const longest = Object.values(FAULT).reduce(
      (most, fault) => (fault.main.length > most.length ? fault.main : most),
      "",
    );
    for (const item of [1, 2, 3, 4, 5]) {
      const copy = serviceCopy(item, { fault: longest, vends: 9999 });
      expect(copy.main.length, copy.main).toBeLessThanOrEqual(LCD_FIT.main);
      expect(copy.sub.length, copy.sub).toBeLessThanOrEqual(LCD_FIT.sub);
    }
  });
});
