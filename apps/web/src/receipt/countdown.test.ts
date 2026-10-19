import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OPEN_AFTER_S, secondsLeft, useCountdown } from "./countdown";

afterEach(() => {
  vi.useRealTimers();
});

describe("secondsLeft", () => {
  it("rounds up to whole seconds and never goes below zero", () => {
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 10_000)).toBe(0);
    expect(secondsLeft(10_000, 12_000)).toBe(0);
  });
});

describe("useCountdown", () => {
  it("shows ten before it starts", () => {
    const { result } = renderHook(() => useCountdown(vi.fn()));
    expect(result.current.left).toBe(OPEN_AFTER_S);
  });

  it("keeps a stop made before the start, until it is armed again", () => {
    vi.useFakeTimers();
    const zero = vi.fn();
    const { result } = renderHook(() => useCountdown(zero));
    act(() => result.current.stop());
    act(() => result.current.start());
    expect(result.current.left).toBeNull();
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(zero).not.toHaveBeenCalled();
    act(() => result.current.arm());
    expect(result.current.left).toBe(OPEN_AFTER_S);
    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(zero).toHaveBeenCalledOnce();
  });

  it("starts at ten and counts down a second at a time", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCountdown(vi.fn()));
    act(() => result.current.start());
    expect(OPEN_AFTER_S).toBe(10);
    expect(result.current.left).toBe(10);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.left).toBe(9);
  });

  it("counts by the clock, so a throttled tab still opens on time", () => {
    vi.useFakeTimers();
    const zero = vi.fn();
    const { result } = renderHook(() => useCountdown(zero));
    act(() => result.current.start());
    act(() => {
      vi.setSystemTime(Date.now() + 9_000);
      vi.advanceTimersByTime(250);
    });
    expect(result.current.left).toBe(1);
    expect(zero).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(750);
    });
    expect(result.current.left).toBe(0);
    expect(zero).toHaveBeenCalledOnce();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(zero).toHaveBeenCalledOnce();
  });

  it("never opens once stopped, and says it stopped", () => {
    vi.useFakeTimers();
    const zero = vi.fn();
    const { result } = renderHook(() => useCountdown(zero));
    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    act(() => result.current.stop());
    expect(result.current.left).toBeNull();
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(zero).not.toHaveBeenCalled();
  });

  it("stops counting when it is unmounted", () => {
    vi.useFakeTimers();
    const zero = vi.fn();
    const { result, unmount } = renderHook(() => useCountdown(zero));
    act(() => result.current.start());
    unmount();
    vi.advanceTimersByTime(20_000);
    expect(zero).not.toHaveBeenCalled();
  });
});
