import { describe, expect, it } from "vitest";
import { createKeypad } from "./keypad";
import type { KeypadResult } from "./keypad";

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

  it("ignores an unrecognised key", () => {
    const keypad = createKeypad(["1", "3"]);
    expect(keypad.press("x")).toEqual({ kind: "ignored" });
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

describe("the cabinet's keypad", () => {
  it("only selects bays; codes are typed on paw.", () => {
    const keypad = createKeypad(["1", "3"]);
    expect("setMode" in keypad).toBe(false);
    expect("digits" in keypad).toBe(false);
  });
});
