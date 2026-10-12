import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MACHINE_PAGE_CSS } from "@pawl/core";
import { describe, expect, it } from "vitest";

const tokens = readFileSync(
  fileURLToPath(new URL("./styles.css", import.meta.url)),
  "utf8",
).toLowerCase();

describe("server-rendered machine pages", () => {
  it("use only colours the design system declares", () => {
    const used = new Set(
      [...MACHINE_PAGE_CSS.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((match) =>
        match[0].toLowerCase(),
      ),
    );
    expect(used.size).toBeGreaterThan(5);
    for (const colour of used) expect(tokens, colour).toContain(`${colour};`);
  });
});
