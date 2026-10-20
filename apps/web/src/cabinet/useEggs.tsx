import { Credit } from "@pawl/ui";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import {
  KONAMI_HOLD_MS,
  konamiHeard,
  LUCKY,
  LUCKY_HOLD_MS,
  ROCK_HOLD_MS,
  ROCK_MS,
  rollFace,
  rollResult,
  ROLL_MS,
  ROLL_TICK_MS,
  tapped,
  TAPS,
} from "./eggs";

export type Notice = { main?: string; sub: string };

const NOT_STEEL =
  "button, a, input, select, textarea, label, [data-part='display'], [data-part='keypad'], [data-receipt-sheet]";

const TYPING = "input, textarea, select, [contenteditable]";

const LUCKY_NOTICE: Notice = { sub: "LUCKY 7777, ONE MORE ON US" };

const ROCK_NOTICE: Notice = {
  main: "NEVER ROCK OR TILT",
  sub: "IT IS FREE ANYWAY",
};

const KONAMI_NOTICE: Notice = {
  main: "+30 LIVES",
  sub: "NOT THAT YOU NEED THEM",
};

export function useEggs(input: {
  machine: RefObject<HTMLDivElement | null>;
  paperOut: boolean;
}): {
  notice: Notice | null;
  rocking: boolean;
  credit: string | undefined;
  lucky: () => void;
} {
  const { machine, paperOut } = input;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [rocking, setRocking] = useState(false);
  const [credit, setCredit] = useState<string | undefined>(undefined);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const later = useCallback((ms: number, done: () => void): void => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      done();
    }, ms);
    timers.current.add(timer);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, []);

  const say = useCallback(
    (next: Notice, ms: number): void => {
      setNotice(next);
      later(ms, () => setNotice((now) => (now === next ? null : now)));
    },
    [later],
  );

  const lucky = useCallback(
    (): void => say(LUCKY_NOTICE, LUCKY_HOLD_MS),
    [say],
  );

  useEffect(() => {
    const node = machine.current;
    if (node === null) return;
    let taps: number[] = [];
    const click = (event: MouseEvent): void => {
      if (event.target instanceof Element && event.target.closest(NOT_STEEL)) {
        return;
      }
      taps = tapped(taps, Date.now());
      if (taps.length < TAPS) return;
      taps = [];
      setRocking(true);
      later(ROCK_MS, () => setRocking(false));
      say(ROCK_NOTICE, ROCK_HOLD_MS);
    };
    node.addEventListener("click", click);
    return () => node.removeEventListener("click", click);
  }, [machine, later, say]);

  useEffect(() => {
    let heard: string[] = [];
    const listen = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest(TYPING)) {
        return;
      }
      const next = konamiHeard(heard, event.key);
      heard = next.heard;
      if (!next.done) return;
      setCredit("  30");
      later(KONAMI_HOLD_MS, () => setCredit(undefined));
      say(KONAMI_NOTICE, KONAMI_HOLD_MS);
    };
    document.addEventListener("keydown", listen);
    return () => document.removeEventListener("keydown", listen);
  }, [later, say]);

  return { notice: paperOut ? null : notice, rocking, credit, lucky };
}

export function LuckyCredit(props: {
  tray: string | null;
  denied: boolean;
  paperOut: boolean;
  override?: string;
  random?: () => number;
  onLucky?: () => void;
}): ReactNode {
  const [roll, setRoll] = useState<{ face: string; won: boolean } | null>(null);
  const latest = useRef({
    random: props.random ?? Math.random,
    onLucky: props.onLucky,
  });
  latest.current = {
    random: props.random ?? Math.random,
    onLucky: props.onLucky,
  };
  const rolling = props.tray !== null && !props.paperOut;

  useEffect(() => {
    if (!rolling) {
      setRoll(null);
      return;
    }
    setRoll({ face: rollFace(latest.current.random), won: false });
    const tick = setInterval(
      () => setRoll({ face: rollFace(latest.current.random), won: false }),
      ROLL_TICK_MS,
    );
    const stop = setTimeout(() => {
      clearInterval(tick);
      const face = rollResult(latest.current.random);
      setRoll({ face, won: face === LUCKY });
      if (face === LUCKY) latest.current.onLucky?.();
    }, ROLL_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(stop);
    };
  }, [rolling, props.tray]);

  const text = props.override ?? roll?.face ?? (props.denied ? "----" : "FrEE");
  return (
    <Credit
      text={text}
      blink={props.override === undefined && roll?.won === true}
    />
  );
}
