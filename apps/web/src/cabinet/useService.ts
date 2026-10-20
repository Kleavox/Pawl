import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { viewFor } from "../machine/copy";
import { LAMP_TEST_MS, secretStep, type Heard } from "../machine/service";
import type { MachineState } from "../machine/state";

export function useService(input: {
  machine: RefObject<HTMLDivElement | null>;
  read: () => MachineState;
}): {
  item: number | null;
  lampTest: boolean;
  active: () => boolean;
  touch: (key: string) => void;
  key: (key: string) => "audit" | null;
  leave: () => void;
} {
  const { machine, read } = input;
  const current = useRef<number | null>(null);
  const [item, setItemState] = useState<number | null>(null);
  const [lampTest, setLampTest] = useState(false);
  const secret = useRef<Heard[]>([]);
  const lampTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const back = useRef<HTMLElement | null>(null);

  const setItem = useCallback((next: number | null): void => {
    current.current = next;
    setItemState(next);
  }, []);

  const leave = useCallback((): void => {
    clearTimeout(lampTimer.current);
    setLampTest(false);
    setItem(null);
  }, [setItem]);

  const active = useCallback((): boolean => current.current !== null, []);

  const touch = useCallback(
    (key: string): void => {
      if (current.current !== null) return;
      const heard = secretStep(secret.current, key, Date.now());
      secret.current = heard.seen;
      if (!heard.open) return;
      const now = read();
      if (viewFor(now) !== "products" || now.receipt !== null || now.busy) {
        return;
      }
      const focused = document.activeElement;
      const products = machine.current?.querySelector(
        "[data-view-panel='products']",
      );
      if (focused instanceof HTMLElement && products?.contains(focused)) {
        back.current = focused;
        machine.current
          ?.querySelector<HTMLElement>("[data-key='GO']")
          ?.focus({ preventScroll: true });
      }
      setItem(1);
    },
    [machine, read, setItem],
  );

  const key = useCallback(
    (pressed: string): "audit" | null => {
      if (pressed === "CLR") {
        leave();
        return null;
      }
      if (/^[1-5]$/u.test(pressed)) {
        setItem(Number(pressed));
        return null;
      }
      if (pressed !== "GO") return null;
      if (current.current === 4) {
        clearTimeout(lampTimer.current);
        setLampTest(true);
        lampTimer.current = setTimeout(() => setLampTest(false), LAMP_TEST_MS);
      }
      return current.current === 5 ? "audit" : null;
    },
    [leave, setItem],
  );

  useEffect(() => () => clearTimeout(lampTimer.current), []);

  useLayoutEffect(() => {
    const focus = back.current;
    if (item !== null || focus === null) return;
    back.current = null;
    if (focus.isConnected) focus.focus({ preventScroll: true });
  }, [item]);

  return { item, lampTest, active, touch, key, leave };
}
