import { describe, expect, it } from "vitest";

import { SEGMENT_GLYPHS, segmentsOf } from "./segments";

describe("the credit display's seven segments", () => {
  it("draws FrEE the way a free-vend display does", () => {
    expect(segmentsOf("FrEE")).toEqual(["aefg", "eg", "adefg", "adefg"]);
  });

  it("lights every segment for the lamp test", () => {
    expect(segmentsOf("8888")).toEqual(Array(4).fill("abcdefg"));
  });

  it("right-aligns a short value, as a status code", () => {
    expect(segmentsOf("404")).toEqual(["", "bcfg", "abcdef", "bcfg"]);
  });

  it("draws dashes for what cannot be bought", () => {
    expect(segmentsOf("----")).toEqual(Array(4).fill("g"));
  });

  it("refuses a character no seven-segment display can draw", () => {
    expect(() => segmentsOf("x")).toThrow(/no segment glyph/);
  });

  it("keeps only four places", () => {
    expect(() => segmentsOf("12345")).toThrow(/four/);
  });

  it("knows every glyph the design names", () => {
    for (const glyph of [..."0123456789- AbCdEFHLnoPrStUuy"]) {
      expect(SEGMENT_GLYPHS[glyph], glyph).toBeDefined();
    }
  });
});
