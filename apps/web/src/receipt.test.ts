import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TEAR_FALL_MS,
  TEAR_JERK_MS,
  TEAR_RIP_MS,
  sagFor,
  scrollBack,
  tearOff,
} from "./receipt";

afterEach(() => {
  vi.useRealTimers();
});

describe("tearOff", () => {
  it("jerks for 90 ms, rips for 120 ms and falls, fluttering, for 560 ms", () => {
    expect([TEAR_JERK_MS, TEAR_RIP_MS, TEAR_FALL_MS]).toEqual([90, 120, 560]);
  });

  it("jerks, rips and falls, then is gone", async () => {
    vi.useFakeTimers();
    const frame = document.createElement("div");
    let done = false;
    const torn = tearOff(frame, { reduced: false }).then(() => {
      done = true;
    });
    expect(frame.dataset.torn).toBe("jerk");
    await vi.advanceTimersByTimeAsync(TEAR_JERK_MS);
    expect(frame.dataset.torn).toBe("rip");
    await vi.advanceTimersByTimeAsync(TEAR_RIP_MS);
    expect(frame.dataset.torn).toBe("fall");
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(TEAR_FALL_MS);
    await torn;
    expect(done).toBe(true);
  });

  it("does not play the tear under reduced motion", async () => {
    const frame = document.createElement("div");
    await tearOff(frame, { reduced: true });
    expect(frame.dataset.torn).toBeUndefined();
  });
});

describe("sagFor", () => {
  it("hangs no slack before any of the receipt is read, all of it at the end", () => {
    expect(sagFor(0, 1100, 100)).toBe(0);
    expect(sagFor(1000, 1100, 100)).toBe(1);
  });

  it("sags fast at first and slower later, as a rope does", () => {
    expect(sagFor(250, 1100, 100)).toBe(0.5);
    expect(sagFor(40, 1100, 100)).toBeCloseTo(0.2);
  });

  it("stays between none and all when the paper overscrolls or does not scroll", () => {
    expect(sagFor(-30, 1100, 100)).toBe(0);
    expect(sagFor(1200, 1100, 100)).toBe(1);
    expect(sagFor(0, 100, 100)).toBe(0);
    expect(sagFor(0, 0, 0)).toBe(0);
  });
});

describe("scrollBack", () => {
  function frameAt(top: number): HTMLElement {
    const frame = document.createElement("div");
    let at = top;
    Object.defineProperty(frame, "scrollTop", {
      get: () => at,
      set: (value: number) => {
        at = value;
      },
    });
    return frame;
  }

  it("scrolls the paper's frame back, not the window", async () => {
    const frame = frameAt(500);
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    await scrollBack(frame, { reduced: true });
    expect(frame.scrollTop).toBe(0);
    expect(scroll).not.toHaveBeenCalled();
    scroll.mockRestore();
  });

  it("does nothing when the slot is already in view", async () => {
    const frame = frameAt(0);
    await scrollBack(frame, { reduced: false });
    expect(frame.scrollTop).toBe(0);
  });

  it("glides back to the slot in about 340 ms, one frame at a time, and ends exactly at the top", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "requestAnimationFrame", "performance"],
    });
    const frame = document.createElement("div");
    const seen: number[] = [];
    Object.defineProperty(frame, "scrollTop", {
      get: () => seen.at(-1) ?? 2400,
      set: (value: number) => {
        seen.push(value);
      },
    });
    const back = scrollBack(frame, { reduced: false });
    await vi.advanceTimersByTimeAsync(360);
    await back;
    expect(seen.at(-1)).toBe(0);
    expect(seen.length).toBeGreaterThan(2);
  });
});
