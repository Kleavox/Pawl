import type { ScreenCopy } from "./copy";

const SECRET = ["4", "2", "3", "1"] as const;
export const SECRET_GAP_MS = 2000;
const MENU = ["ERROR", "SALE", "CASH", "TEST", "AUDIT"] as const;
export const LAMP_TEST_MS = 1200;

export type Heard = { key: string; at: number };

export function secretStep(
  seen: readonly Heard[],
  key: string,
  at: number,
): { seen: Heard[]; open: boolean } {
  const last = seen.at(-1);
  const kept = last !== undefined && at - last.at > SECRET_GAP_MS ? [] : seen;
  const next = [...kept, { key, at }].slice(-SECRET.length);
  const open =
    next.length === SECRET.length &&
    next.every((heard, place) => heard.key === SECRET[place]);
  return { seen: open ? [] : next, open };
}

const SAYS: Record<
  number,
  (facts: { fault: string | null; vends: number }) => string
> = {
  1: (facts) => facts.fault ?? "NONE",
  2: (facts) => `${facts.vends} VENDED THIS PAGE`,
  3: () => "0.00 · FREE VEND",
  4: () => "GO RUNS THE LAMP TEST",
  5: () => "GO PRINTS THE AUDIT",
};

export function serviceCopy(
  item: number,
  facts: { fault: string | null; vends: number },
): ScreenCopy {
  return {
    main: `SERVICE ${item} ${MENU[item - 1] ?? ""}`,
    sub: SAYS[item]?.(facts) ?? "",
  };
}

export function serviceCredit(item: number): string {
  return `SEr${item}`;
}
