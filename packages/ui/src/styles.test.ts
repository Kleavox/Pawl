import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  fileURLToPath(new URL("./styles.css", import.meta.url)),
  "utf8",
);

describe("the machine's design tokens", () => {
  it("declares the two sequence durations the vending machine needs", () => {
    expect(css).toMatch(/--pw-t5:\s*900ms;/);
    expect(css).toMatch(/--pw-t6:\s*1400ms;/);
  });

  it("holds exactly the palette the spec names, so a new colour is a decision", () => {
    const colours = [
      ...css.matchAll(/--pw-[a-z0-9-]+:\s*#[0-9a-fA-F]{3,8}\s*;/g),
    ];
    expect(colours).toHaveLength(39);
  });

  it("keeps one accent: cobalt is the only colour named for action", () => {
    expect(css).toMatch(/--pw-cobalt:\s*#2f6bff;/);
    expect(css).not.toMatch(/--pw-accent/);
  });

  it("carries nothing from the old lime palette", () => {
    expect(css.toLowerCase()).not.toContain("#a3e635");
    expect(css).not.toMatch(/--dt-/);
  });

  it("still declares nothing that animates forever", () => {
    expect(css).not.toMatch(/\binfinite\b/);
  });
});
