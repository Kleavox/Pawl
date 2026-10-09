import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");

const DOM = source("./app-header-dom.ts");
const REACT = source("./app-header.tsx");

function toolKeys(text: string): string[] {
  const block = /const TOOLS = \[(.*?)\] as const;/s.exec(text)?.[1] ?? "";
  return [...block.matchAll(/key:\s*"([a-z]+)"/g)].map(
    (match) => match[1] ?? "",
  );
}

describe("the shared header's tool list", () => {
  it("is identical in the DOM and React renderers", () => {
    expect(toolKeys(DOM)).toEqual(toolKeys(REACT));
    expect(toolKeys(DOM).length).toBeGreaterThan(0);
  });

  it("offers no tool that left the platform", () => {
    expect(toolKeys(DOM)).not.toContain("pulse");
  });

  it("names the identity tool Pawl while its key stays the wire format", () => {
    for (const source of [DOM, REACT]) {
      expect(source).toMatch(/key:\s*"pass",\s*label:\s*"pawl"/u);
    }
  });
});
