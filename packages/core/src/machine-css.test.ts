import { describe, expect, it } from "vitest";

import { machineCss } from "../scripts/machine-css.mjs";
import { MACHINE_CSS } from "./machine-css";

const FONT_SIZE = /font-size:\s*([^;]+);/g;

describe("the machine stylesheet the Worker inlines", () => {
  it("is the ui stylesheet's tokens and machine.css, unchanged (run pnpm --filter @pawl/core css:machine)", () => {
    expect(MACHINE_CSS).toBe(machineCss());
  });

  it("frames the camera three ways and sizes the machine in one unit", () => {
    for (const needed of [
      "@property --u",
      "@property --cam-s",
      '[data-framing="whole"]',
      '[data-framing="screen"]',
      '[data-framing="printer"]',
      "--u: clamp(",
    ]) {
      expect(MACHINE_CSS).toContain(needed);
    }
  });

  it("starts a page in the framing its #cam= hint names, until the page settles the camera", () => {
    for (const framing of ["screen", "printer"]) {
      expect(MACHINE_CSS).toContain(
        `.room:has(#cam\\=${framing}:target) .camera:not([data-settled])`,
      );
    }
  });

  it("dollies in after the printer's LED blinks twice, or after the pressed control glows", () => {
    expect(MACHINE_CSS).toMatch(
      /\.camera\[data-moving="in"\]\[data-framing="printer"\]\s*\{\s*transition-delay:\s*120ms;\s*transition-duration:\s*440ms;/,
    );
    expect(MACHINE_CSS).toMatch(
      /\.camera\[data-moving="in"\]\[data-framing="screen"\]\s*\{\s*transition-delay:\s*80ms;\s*transition-duration:\s*480ms;/,
    );
    expect(MACHINE_CSS).toContain(
      '.machine[data-leaving="printer"] .printer__led',
    );
  });

  it("keeps the machine's measures on the root, so a receipt can hang from the slot outside the room", () => {
    const root = /:root\s*\{([^}]*)\}/g;
    const declared = [...MACHINE_CSS.matchAll(root)].map((m) => m[1]).join("");
    for (const name of ["--u:", "--slot-w:", "--slot-cx:", "--printer-s:"]) {
      expect(declared).toContain(name);
    }
  });

  it("zooms the printer only as far as the screen allows, so the paper fits a phone", () => {
    const scales = [...MACHINE_CSS.matchAll(/--printer-s:\s*([^;]+);/g)].map(
      (m) => m[1]!.replace(/\s+/g, " "),
    );
    expect(scales).toHaveLength(2);
    for (const scale of scales) {
      expect(scale).toMatch(/^min\( ?\d+(\.\d+)?, tan\( ?atan2\(/);
    }
  });

  it("gives the printer framing exactly one viewport of room, so the zoomed machine never scrolls the page", () => {
    const flat = MACHINE_CSS.replace(/\s+/g, " ")
      .replace(/\( /g, "(")
      .replace(/ \)/g, ")");
    expect(flat).toContain(
      '.room:has(> .camera[data-framing="printer"]), .room:has(#cam\\=printer:target):has(> .camera:not([data-settled])) { height: 100svh; }',
    );
  });

  it("never zooms the screen framing below the machine's own size, and lets a short window scroll instead", () => {
    const flat = MACHINE_CSS.replace(/\s+/g, " ")
      .replace(/\( /g, "(")
      .replace(/ \)/g, ")");
    expect(flat).toMatch(/--screen-s: max\(1, min\(/);
    expect(flat).toContain("--cam-s: var(--screen-s);");
    expect(flat).toContain(
      "height: max(100svh, calc(var(--screen-h) * var(--u) * var(--screen-s) + 2 * var(--margin)));",
    );
  });

  it("sizes and frames by the small viewport, so a phone's toolbar never resizes the machine", () => {
    const machine = MACHINE_CSS.slice(MACHINE_CSS.indexOf("@property --u"));
    expect(machine).not.toMatch(/dvh/);
    expect(machine).toContain("100svh");
  });

  it("clips the room without making it a scroll container, so focus never shifts the frame", () => {
    const room = /\.room \{[^}]*\}/.exec(MACHINE_CSS)![0];
    expect(room).toContain("overflow: clip;");
    expect(room).not.toContain("overflow: hidden");
  });

  it("scrolls the ticker once when its words are longer than its window", () => {
    expect(MACHINE_CSS).toContain('.marquee__ticker-text[data-scroll="once"]');
    expect(MACHINE_CSS).toMatch(
      /\.marquee__ticker-text\[data-scroll="once"\] \{\s*animation: machine-ticker [^;]* 1 both;/,
    );
  });

  it("gives a service keypad the same key rows as the machine's, its caption in the lamp row", () => {
    expect(MACHINE_CSS).not.toMatch(
      /\.keypad--service \{[^}]*grid-template-rows/,
    );
    expect(MACHINE_CSS).toMatch(
      /\.keypad__caption \{[^}]*white-space: nowrap;/,
    );
  });

  it("never sets machine text below 14 units, which is 0.7rem at the smallest scale", () => {
    const machine = MACHINE_CSS.slice(MACHINE_CSS.indexOf("@property --u"));
    const small: string[] = [];
    for (const match of machine.matchAll(FONT_SIZE)) {
      const units = /^calc\((\d+(?:\.\d+)?) \* var\(--u\)\)$/.exec(
        match[1]!.trim(),
      );
      if (units === null || Number(units[1]) < 14) small.push(match[1]!);
    }
    expect(small).toEqual([]);
  });
});
