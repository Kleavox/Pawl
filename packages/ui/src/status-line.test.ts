import { describe, expect, it } from "vitest";
import {
  fieldText,
  formatAge,
  plural,
  statusSentence,
  type StatusLineModel,
} from "./status-line";

const model: StatusLineModel = {
  tool: "link",
  fields: [
    { value: "12", label: "active routes" },
    { value: "3", label: "files" },
    { value: "1", label: "expiring in 6 hours", attention: true },
    { value: "0", label: "reported" },
  ],
};

describe("statusSentence", () => {
  it("expands the line into something a screen reader can read", () => {
    expect(statusSentence(model)).toBe(
      "link: 12 active routes, 3 files, 1 expiring in 6 hours, 0 reported",
    );
  });

  it("keeps zeroes, because an absent field is ambiguous", () => {
    expect(statusSentence(model)).toContain("0 reported");
  });

  it("reads a tool with no fields as its name alone", () => {
    expect(statusSentence({ tool: "pass", fields: [] })).toBe("pass");
  });

  it("emits a bare value when the field has no label", () => {
    expect(
      statusSentence({
        tool: "pass",
        fields: [
          { value: "probeops", label: "" },
          { value: "1", label: "devices" },
        ],
      }),
    ).toBe("pass: probeops, 1 devices");
  });
});

describe("fieldText", () => {
  it("joins value and label", () => {
    expect(fieldText({ value: "12", label: "active" })).toBe("12 active");
  });

  it("emits the value alone when the label is empty, with no trailing space", () => {
    expect(fieldText({ value: "probeops", label: "" })).toBe("probeops");
  });
});

describe("plural", () => {
  it("uses the singular form for a count of one", () => {
    expect(plural(1, "device", "devices")).toBe("device");
  });

  it("uses the plural form for zero", () => {
    expect(plural(0, "device", "devices")).toBe("devices");
  });

  it("uses the plural form above one", () => {
    expect(plural(3, "device", "devices")).toBe("devices");
  });
});

describe("formatAge", () => {
  const now = new Date("2026-08-25T18:00:00Z");

  it("reports whole hours below a day", () => {
    expect(formatAge("2026-08-25T16:00:00Z", now)).toBe("2h");
  });

  it("reports minutes below an hour", () => {
    expect(formatAge("2026-08-25T17:43:00Z", now)).toBe("17m");
  });

  it("reports days beyond twenty-four hours", () => {
    expect(formatAge("2026-08-22T18:00:00Z", now)).toBe("3d");
  });

  it("floors to a minute rather than showing seconds", () => {
    expect(formatAge("2026-08-25T17:59:30Z", now)).toBe("0m");
  });

  it("returns a dash for an unparseable timestamp", () => {
    expect(formatAge("not a date", now)).toBe("--");
  });

  it("returns a dash rather than a negative age for a future timestamp", () => {
    expect(formatAge("2026-08-25T19:00:00Z", now)).toBe("--");
  });

  it("reports the remaining time until a future timestamp when asked for remaining", () => {
    expect(formatAge("2026-08-26T00:00:00Z", now, "remaining")).toBe("6h");
  });

  it("returns a dash for remaining time on a timestamp already in the past", () => {
    expect(formatAge("2026-08-25T16:00:00Z", now, "remaining")).toBe("--");
  });
});
