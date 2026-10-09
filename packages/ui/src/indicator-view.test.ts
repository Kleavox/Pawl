import { describe, expect, it } from "vitest";
import type { Indicator } from "./nav-counts";
import { displayFor, nameFor, padClass, severityFor } from "./indicator-view";

const known: Indicator = { count: 3, severity: null };
const dangerKnown: Indicator = { count: 3, severity: "danger" };
const warnKnown: Indicator = { count: 3, severity: "warn" };

describe("nameFor", () => {
  it("names the not-yet-loaded state with just the label", () => {
    expect(nameFor("pass", "devices", undefined)).toBe("pass");
  });

  it("names locked distinctly, not as a bare label", () => {
    expect(nameFor("pass", "devices", "locked")).toBe("pass, locked");
  });

  it("never lets locked collide with the not-yet-loaded state", () => {
    const locked = nameFor("pass", "devices", "locked");
    const notYetLoaded = nameFor("pass", "devices", undefined);
    expect(locked).not.toBe(notYetLoaded);
  });

  it("names unknown distinctly from locked", () => {
    expect(nameFor("pass", "devices", "unknown")).toBe("pass, unknown");
    expect(nameFor("pass", "devices", "unknown")).not.toBe(
      nameFor("pass", "devices", "locked"),
    );
  });

  it("names a known count with the tool's noun", () => {
    expect(nameFor("pass", "devices", known)).toBe("pass, 3 devices");
  });

  it("produces four distinct names, one per state, so swapping any two would fail", () => {
    const names = [
      nameFor("pass", "devices", undefined),
      nameFor("pass", "devices", "locked"),
      nameFor("pass", "devices", "unknown"),
      nameFor("pass", "devices", known),
    ];
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("displayFor", () => {
  it("shows nothing for the not-yet-loaded state", () => {
    expect(displayFor(undefined)).toBeNull();
  });

  it("shows nothing, not a dash, for locked", () => {
    expect(displayFor("locked")).toBeNull();
  });

  it("shows a dash for unknown", () => {
    expect(displayFor("unknown")).toBe("--");
  });

  it("shows the number for a known count", () => {
    expect(displayFor(known)).toBe("3");
  });
});

describe("severityFor", () => {
  it("carries no severity for the not-yet-loaded state", () => {
    expect(severityFor(undefined)).toBeNull();
  });

  it("carries no severity for locked, so it draws no pad", () => {
    expect(severityFor("locked")).toBeNull();
  });

  it("carries warn severity for unknown, which is itself an alarm", () => {
    expect(severityFor("unknown")).toBe("warn");
  });

  it("carries the block's own severity for a known count", () => {
    expect(severityFor(known)).toBeNull();
    expect(severityFor(warnKnown)).toBe("warn");
    expect(severityFor(dangerKnown)).toBe("danger");
  });
});

describe("padClass", () => {
  it("draws the warn pad", () => {
    expect(padClass("warn")).toBe("pw-pad pw-pad-warn");
  });

  it("draws the danger pad", () => {
    expect(padClass("danger")).toBe("pw-pad pw-pad-danger");
  });
});

describe("locked carries no count and no pad", () => {
  it("has neither a display value nor a severity", () => {
    expect(displayFor("locked")).toBeNull();
    expect(severityFor("locked")).toBeNull();
  });
});
