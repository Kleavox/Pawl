export const CODE39: Readonly<Record<string, string>> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  $: "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
};

export type Stripe = { bar: boolean; wide: boolean };

const MOST = 16;

export function code39Bars(data: string): Stripe[] {
  const chars = ["*", ...data, "*"];
  const out: Stripe[] = [];
  chars.forEach((char, index) => {
    const pattern = CODE39[char];
    const edge = index === 0 || index === chars.length - 1;
    if (pattern === undefined || (char === "*" && !edge)) {
      throw new Error(`Code 39 cannot hold ${char}`);
    }
    [...pattern].forEach((element, at) =>
      out.push({ bar: at % 2 === 0, wide: element === "w" }),
    );
    if (!edge || index === 0) out.push({ bar: false, wide: false });
  });
  return out;
}

export function code39Text(raw: string): string {
  return [...raw.toUpperCase()]
    .map((char) => (char !== "*" && CODE39[char] !== undefined ? char : "-"))
    .join("")
    .slice(0, MOST);
}

export function deliveryCode(bay: string, printed: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return code39Text(
    `${bay}-${two(printed.getHours())}${two(printed.getMinutes())}`,
  );
}
