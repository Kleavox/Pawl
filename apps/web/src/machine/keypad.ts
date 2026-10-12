import type { BayCode } from "./state";

export type KeypadMode = "selector" | "otp";

export type KeypadResult =
  | { kind: "selected"; bay: BayCode }
  | { kind: "confirm"; bay: BayCode }
  | { kind: "code-complete"; code: string }
  | { kind: "cleared" }
  | { kind: "cancelled" }
  | { kind: "ignored" };

export type Keypad = {
  readonly mode: KeypadMode;
  setMode(mode: KeypadMode): void;
  press(key: string): KeypadResult;
  digits(): string;
  reset(): void;
};

const OTP_LENGTH = 6;
const DIGIT = /^[0-9]$/u;

export function createKeypad(codes: readonly BayCode[]): Keypad {
  const isBayCode = (key: string): key is BayCode => codes.includes(key);
  let mode: KeypadMode = "selector";
  let pendingBay: BayCode | null = null;
  let buffer = "";

  function pressSelector(key: string): KeypadResult {
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
  }

  function pressOtp(key: string): KeypadResult {
    if (key === "CLR") {
      if (buffer.length === 0) {
        mode = "selector";
        pendingBay = null;
        return { kind: "cancelled" };
      }
      buffer = buffer.slice(0, -1);
      return { kind: "cleared" };
    }
    if (DIGIT.test(key)) {
      if (buffer.length >= OTP_LENGTH) return { kind: "ignored" };
      buffer += key;
      if (buffer.length === OTP_LENGTH) {
        return { kind: "code-complete", code: buffer };
      }
      return { kind: "ignored" };
    }
    return { kind: "ignored" };
  }

  return {
    get mode() {
      return mode;
    },
    setMode(next) {
      if (next === mode) return;
      mode = next;
      buffer = "";
    },
    press(key) {
      return mode === "selector" ? pressSelector(key) : pressOtp(key);
    },
    digits() {
      return buffer;
    },
    reset() {
      buffer = "";
      pendingBay = null;
    },
  };
}
