import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const theme = readFileSync(resolve(process.cwd(), "src/theme.css"), "utf8");
const flat = theme.replace(/\s+/g, " ");

describe("the theme, Tailwind's one configuration file", () => {
  it("imports Tailwind's theme and utilities, without preflight, and measures in machine units", () => {
    expect(theme).toMatch(/^@layer theme, base, components, utilities;/);
    expect(theme).toContain('@import "tailwindcss/theme.css" layer(theme);');
    expect(theme).toContain(
      '@import "tailwindcss/utilities.css" layer(utilities);',
    );
    expect(theme).not.toContain("preflight");
    expect(flat).toContain("--spacing: var(--u);");
    expect(flat).toContain("--color-*: initial;");
    expect(flat).toContain("--text-*: initial;");
    expect(flat).toContain("--breakpoint-desk: 900px;");
  });

  it("registers the camera's properties so it glides", () => {
    for (const name of ["--u", "--cam-s", "--cam-x", "--cam-y"]) {
      expect(theme).toContain(`@property ${name} {`);
    }
  });

  it("keeps the machine's measures of today", () => {
    for (const measure of [
      "--mw: 1000;",
      "--mh: 748;",
      "--slot-cx: 869;",
      "--slot-cy: 583;",
      "--slot-w: 150;",
      "--screen-x: 11;",
      "--screen-y: 81;",
      "--screen-w: 978;",
      "--screen-h: 544;",
      "--mw: 370;",
      "--mh: 896;",
      "--slot-cy: 701;",
      "--screen-h: 678;",
    ]) {
      expect(flat).toContain(measure);
    }
  });

  it("never sets a machine text size below 14 units", () => {
    const sizes = [
      ...theme.matchAll(/--text-(\d+): calc\((\d+) \* var\(--u\)\);/g),
    ];
    expect(sizes.length).toBeGreaterThan(0);
    for (const [, name, units] of sizes) {
      expect(name).toBe(units);
      expect(Number(units)).toBeGreaterThanOrEqual(14);
    }
  });

  it("names the camera formulas instead of inlining them", () => {
    for (const name of [
      "camera-whole",
      "camera-screen",
      "camera-printer",
      "room-screen",
      "room-printer",
      "keycap",
    ]) {
      expect(theme).toContain(`@utility ${name} {`);
    }
  });

  it("runs no animation forever", () => {
    expect(theme).not.toMatch(/infinite/);
  });
});

describe("the machine's design tokens", () => {
  it("declares the two sequence durations the vending machine needs", () => {
    expect(theme).toMatch(/--pw-t5:\s*900ms;/);
    expect(theme).toMatch(/--pw-t6:\s*1400ms;/);
  });

  it("holds exactly the palette the spec names, so a new colour is a decision", () => {
    const colours = [
      ...theme.matchAll(/--pw-[a-z0-9-]+:\s*#[0-9a-fA-F]{3,8}\s*;/g),
    ];
    expect(colours).toHaveLength(39);
  });

  it("keeps one accent: cobalt is the only colour named for action", () => {
    expect(theme).toMatch(/--pw-cobalt:\s*#2f6bff;/);
    expect(theme).not.toMatch(/--pw-accent/);
  });

  it("carries nothing from the old lime palette", () => {
    expect(theme).not.toMatch(/--dt-/);
  });
});
