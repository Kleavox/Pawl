import type { BayCode } from "./state";

export type KeypadResult =
  | { kind: "selected"; bay: BayCode }
  | { kind: "confirm"; bay: BayCode }
  | { kind: "cancelled" }
  | { kind: "ignored" };

export type Keypad = {
  press(key: string): KeypadResult;
  reset(): void;
};

export function createKeypad(codes: readonly BayCode[]): Keypad {
  const isBayCode = (key: string): key is BayCode => codes.includes(key);
  let pendingBay: BayCode | null = null;

  return {
    press(key) {
      if (isBayCode(key)) {
        pendingBay = key;
        return { kind: "selected", bay: key };
      }
      if (key === "GO") {
        if (pendingBay === null) return { kind: "ignored" };
        const bay = pendingBay;
        pendingBay = null;
        return { kind: "confirm", bay };
      }
      if (key === "CLR" && pendingBay !== null) {
        pendingBay = null;
        return { kind: "cancelled" };
      }
      return { kind: "ignored" };
    },
    reset() {
      pendingBay = null;
    },
  };
}
