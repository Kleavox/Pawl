import { afterEach, describe, expect, it, vi } from "vitest";

import { TEAR_FALL_MS, TEAR_JERK_MS, scrollBack, tearOff } from "./receipt";

function paper(): HTMLElement {
  return { dataset: {} } as unknown as HTMLElement;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("tearOff", () => {
  it("jerks, then tears and falls, all inside 420 ms", () => {
    expect(TEAR_JERK_MS).toBe(90);
    expect(TEAR_JERK_MS + TEAR_FALL_MS).toBeLessThanOrEqual(420);
  });

  it("marks the paper jerking, then falling, and resolves once it is out of frame", async () => {
    vi.useFakeTimers();
    const sheet = paper();
    let done = false;
    const torn = tearOff(sheet, { reduced: false }).then(() => {
      done = true;
    });
    expect(sheet.dataset.torn).toBe("jerk");
    await vi.advanceTimersByTimeAsync(TEAR_JERK_MS);
    expect(sheet.dataset.torn).toBe("fall");
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(TEAR_FALL_MS);
    await torn;
    expect(done).toBe(true);
  });

  it("does not play the tear under reduced motion", async () => {
    const sheet = paper();
    await tearOff(sheet, { reduced: true });
    expect(sheet.dataset.torn).toBeUndefined();
  });
});

describe("scrollBack", () => {
  function view(scrollY: number) {
    const scrollTo = vi.fn((_x: number, y: number) => {
      view.y = y;
    });
    const view = { scrollY, scrollTo, y: scrollY } as unknown as Window & {
      y: number;
      scrollTo: typeof scrollTo;
    };
    return view;
  }

  it("does nothing when the slot is already in view", async () => {
    const win = view(0);
    await scrollBack(win, { reduced: false });
    expect(win.scrollTo).not.toHaveBeenCalled();
  });

  it("jumps to the top at once under reduced motion", async () => {
    const win = view(2400);
    await scrollBack(win, { reduced: true });
    expect(win.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("glides back to the slot in about 340 ms, one frame at a time, and ends exactly at the top", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "requestAnimationFrame", "performance"],
    });
    const win = view(2400);
    const back = scrollBack(win, { reduced: false });
    await vi.advanceTimersByTimeAsync(360);
    await back;
    expect(win.scrollTo).toHaveBeenLastCalledWith(0, 0);
    expect(win.scrollTo.mock.calls.length).toBeGreaterThan(2);
  });
});
