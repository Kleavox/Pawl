import { describe, expect, it } from "vitest";
import { createKeypad } from "./keypad";
import type { KeypadMode, KeypadResult } from "./keypad";

describe("selector mode", () => {
  it("takes a product number and waits for GO", () => {
    const keypad = createKeypad(["1", "3"]);
    expect(keypad.press("1")).toEqual({ kind: "selected", bay: "1" });
    expect(keypad.press("GO")).toEqual({ kind: "confirm", bay: "1" });
  });

  it("ignores an empty bay number", () => {
    const keypad = createKeypad(["1", "3"]);
    expect(keypad.press("7")).toEqual({ kind: "ignored" });
    expect(keypad.press("2")).toEqual({ kind: "ignored" });
  });

  it("ignores 0, which is not a bay number", () => {
    const keypad = createKeypad(["1", "3"]);
    expect(keypad.press("0")).toEqual({ kind: "ignored" });
  });

  it("ignores CLR, which has nothing to clear", () => {
    const keypad = createKeypad(["1", "3"]);
    expect(keypad.press("CLR")).toEqual({ kind: "ignored" });
  });

  it("drops a picked bay on CLR, so GO no longer releases it", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.press("1");
    expect(keypad.press("CLR")).toEqual({ kind: "cancelled" });
    expect(keypad.press("GO")).toEqual({ kind: "ignored" });
  });

  it("ignores GO with no pending selection", () => {
    const keypad = createKeypad(["1", "3"]);
    expect(keypad.press("GO")).toEqual({ kind: "ignored" });
  });

  it("replaces the pending selection when a second number is pressed", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.press("1");
    expect(keypad.press("3")).toEqual({ kind: "selected", bay: "3" });
    expect(keypad.press("GO")).toEqual({ kind: "confirm", bay: "3" });
  });

  it("consumes the pending choice, so a second GO is ignored", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.press("2");
    keypad.press("GO");
    expect(keypad.press("GO")).toEqual({ kind: "ignored" });
  });

  it("never fills the digit buffer in selector mode", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.press("2");
    expect(keypad.digits()).toBe("");
  });

  it("ignores an unrecognised key", () => {
    const keypad = createKeypad(["1", "3"]);
    expect(keypad.press("x")).toEqual({ kind: "ignored" });
  });
});

describe("otp mode", () => {
  it("collects six digits and then verifies", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.setMode("otp");
    for (const digit of "24681") keypad.press(digit);
    expect(keypad.digits()).toBe("24681");
    const result: KeypadResult = keypad.press("0");
    expect(result).toEqual({
      kind: "code-complete",
      code: "246810",
    });
  });

  it("clears one digit, then cancels when empty", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.setMode("otp");
    keypad.press("1");
    expect(keypad.press("CLR")).toEqual({ kind: "cleared" });
    expect(keypad.press("CLR")).toEqual({ kind: "cancelled" });
  });

  it("returns to selector after cancelling", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.setMode("otp");
    keypad.press("CLR");
    const mode: KeypadMode = keypad.mode;
    expect(mode).toBe("selector");
  });

  it("does not cancel while a digit remains, only when the buffer is empty", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.setMode("otp");
    keypad.press("4");
    keypad.press("CLR");
    expect(keypad.mode).toBe("otp");
  });

  it("removes exactly the last digit on CLR", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.setMode("otp");
    keypad.press("1");
    keypad.press("2");
    keypad.press("3");
    keypad.press("CLR");
    expect(keypad.digits()).toBe("12");
  });

  it("ignores further digits once the code is complete, until reset", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.setMode("otp");
    for (const digit of "123456") keypad.press(digit);
    expect(keypad.press("9")).toEqual({ kind: "ignored" });
    expect(keypad.digits()).toBe("123456");
  });

  it("lets CLR walk the buffer back down after the six-digit lock, so a user can never get stuck", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.setMode("otp");
    for (const digit of "123456") keypad.press(digit);
    expect(keypad.press("7")).toEqual({ kind: "ignored" });
    expect(keypad.digits()).toBe("123456");
    expect(keypad.press("CLR")).toEqual({ kind: "cleared" });
    expect(keypad.digits()).toBe("12345");
  });

  it("accepts a fresh code after reset without changing mode", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.setMode("otp");
    for (const digit of "123456") keypad.press(digit);
    keypad.reset();
    expect(keypad.digits()).toBe("");
    expect(keypad.mode).toBe("otp");
    for (const digit of "65432") keypad.press(digit);
    expect(keypad.press("1")).toEqual({
      kind: "code-complete",
      code: "654321",
    });
  });

  it("ignores GO, which has no meaning while entering a code", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.setMode("otp");
    keypad.press("1");
    expect(keypad.press("GO")).toEqual({ kind: "ignored" });
    expect(keypad.digits()).toBe("1");
  });

  it("ignores an unrecognised key without touching the buffer", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.setMode("otp");
    expect(keypad.press("x")).toEqual({ kind: "ignored" });
    expect(keypad.digits()).toBe("");
  });

  it("starts each otp session with an empty buffer, even after a prior otp session left digits behind", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.setMode("otp");
    keypad.press("1");
    keypad.press("2");
    keypad.setMode("selector");
    keypad.setMode("otp");
    expect(keypad.digits()).toBe("");
  });
});

describe("reset", () => {
  it("clears the selector's pending choice", () => {
    const keypad = createKeypad(["1", "3"]);
    keypad.press("2");
    keypad.reset();
    expect(keypad.press("GO")).toEqual({ kind: "ignored" });
  });
});
