import { useCallback, useEffect, useRef, useState } from "react";

export const OPEN_AFTER_S = 10;
const TICK_MS = 250;

export function secondsLeft(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function useCountdown(onZero: () => void): {
  left: number | null;
  arm: () => void;
  start: () => void;
  stop: () => void;
} {
  const [left, setLeft] = useState<number | null>(OPEN_AFTER_S);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopped = useRef(false);
  const zero = useRef(onZero);
  zero.current = onZero;

  const halt = useCallback((): void => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const stop = useCallback((): void => {
    halt();
    stopped.current = true;
    setLeft(null);
  }, [halt]);

  const arm = useCallback((): void => {
    halt();
    stopped.current = false;
    setLeft(OPEN_AFTER_S);
  }, [halt]);

  const start = useCallback((): void => {
    if (stopped.current) return;
    halt();
    const deadline = Date.now() + OPEN_AFTER_S * 1000;
    setLeft(OPEN_AFTER_S);
    timer.current = setInterval(() => {
      const now = secondsLeft(deadline, Date.now());
      setLeft(now);
      if (now > 0) return;
      halt();
      zero.current();
    }, TICK_MS);
  }, [halt]);

  useEffect(() => halt, [halt]);

  return { left, arm, start, stop };
}
