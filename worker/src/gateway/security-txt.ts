const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function securityTxt(input: {
  contact: string;
  canonical: string;
  now: Date;
}): string {
  const expires = new Date(input.now.getTime() + YEAR_MS)
    .toISOString()
    .replace(/\.\d{3}Z$/u, "Z");
  return [
    `Contact: mailto:${input.contact}`,
    `Expires: ${expires}`,
    "Preferred-Languages: en",
    `Canonical: ${input.canonical}`,
    "",
  ].join("\n");
}
