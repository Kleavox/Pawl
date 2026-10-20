import { describe, expect, it } from "vitest";

import {
  KONAMI,
  konamiHeard,
  LUCKY,
  LUCKY_ODDS,
  rollResult,
  tapped,
  TAP_WINDOW_MS,
} from "./eggs";

function sequence(...values: number[]): () => number {
  let at = 0;
  return () => values[at++ % values.length]!;
}

describe("the lucky number", () => {
  it("wins one time in fifty", () => {
    expect(LUCKY_ODDS).toBe(50);
    expect(rollResult(sequence(0))).toBe(LUCKY);
    expect(rollResult(sequence(1 / 50 - 1e-9))).toBe(LUCKY);
    expect(rollResult(sequence(1 / 50, 0.1, 0.2, 0.3, 0.4))).toBe("1234");
  });

  it("never shows four of a kind without winning", () => {
    expect(rollResult(sequence(0.5))).toBe("5556");
    expect(rollResult(sequence(0.5, 0.75, 0.75, 0.75, 0.75))).toBe("7778");
    expect(rollResult(sequence(0.5, 0.95, 0.95, 0.95, 0.95))).toBe("9990");
  });
});

describe("the Konami code", () => {
  function hear(keys: string[]): boolean {
    let heard: string[] = [];
    let done = false;
    for (const key of keys) {
      const next = konamiHeard(heard, key);
      heard = next.heard;
      done = next.done;
    }
    return done;
  }

  it("is heard in full, letters in either case", () => {
    expect(hear([...KONAMI])).toBe(true);
    expect(hear([...KONAMI.slice(0, 8), "B", "A"])).toBe(true);
  });

  it("is heard after a false start", () => {
    expect(hear(["ArrowUp", ...KONAMI])).toBe(true);
    expect(hear(["x", "ArrowDown", ...KONAMI])).toBe(true);
  });

  it("is not heard out of order or short", () => {
    expect(hear(KONAMI.slice(0, 9))).toBe(false);
    expect(hear([...KONAMI.slice(0, 8), "a", "b"])).toBe(false);
  });
});

describe("rocking taps", () => {
  it("keeps only the taps inside the window", () => {
    expect(tapped([0, 100, 200], 300)).toEqual([0, 100, 200, 300]);
    expect(tapped([0, 100, 2200], 2300)).toEqual([2200, 2300]);
    expect(tapped([0], TAP_WINDOW_MS + 1)).toEqual([TAP_WINDOW_MS + 1]);
  });
});
