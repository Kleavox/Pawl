import { describe, expect, it } from "vitest";

import { compilePageCss } from "../scripts/page-css.mjs";
import { PAGE_CSS } from "./page-css";

describe("PAGE_CSS", () => {
  it("is the CSS a fresh compile of the theme gives (run pnpm --filter @pawl/ui css:pages)", () => {
    expect(PAGE_CSS).toBe(compilePageCss());
  }, 60_000);

  it("carries the machine's tokens and the classes the pages use, and no app's", () => {
    expect(PAGE_CSS).toContain("--pw-cobalt");
    expect(PAGE_CSS).toContain("✓");
    expect(PAGE_CSS).not.toContain("is-wiping");
  });
});
