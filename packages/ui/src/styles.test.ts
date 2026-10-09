import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  fileURLToPath(new URL("./styles.css", import.meta.url)),
  "utf8",
);

describe("machine motion tokens", () => {
  it("declares the two sequence durations the vending machine needs", () => {
    expect(css).toMatch(/--pw-t5:\s*900ms;/);
    expect(css).toMatch(/--pw-t6:\s*1400ms;/);
  });

  it("adds no colour token, which would break parity with apps that mirror the palette", () => {
    const colours = [
      ...css.matchAll(/--(?:pw|dt)-[a-z0-9-]+:\s*#[0-9a-fA-F]{3,8}\s*;/g),
    ];
    expect(colours).toHaveLength(20);
  });

  it("still declares nothing that animates forever", () => {
    expect(css).not.toMatch(/\binfinite\b/);
  });
});
