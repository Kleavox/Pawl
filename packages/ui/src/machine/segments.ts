export const SEGMENT_GLYPHS: Readonly<Record<string, string>> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  " ": "",
  A: "abcefg",
  b: "cdefg",
  C: "adef",
  d: "bcdeg",
  E: "adefg",
  F: "aefg",
  H: "bcefg",
  L: "def",
  n: "ceg",
  o: "cdeg",
  P: "abefg",
  r: "eg",
  S: "acdfg",
  t: "defg",
  U: "bcdef",
  u: "cde",
  y: "bcdfg",
};

const PLACES = 4;

export function segmentsOf(text: string): string[] {
  if (text.length > PLACES) {
    throw new Error(`the credit display has four places: ${text}`);
  }
  return [...text.padStart(PLACES, " ")].map((glyph) => {
    const lit = SEGMENT_GLYPHS[glyph];
    if (lit === undefined) throw new Error(`no segment glyph for ${glyph}`);
    return lit;
  });
}
