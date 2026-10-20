import { describe, expect, it } from "vitest";

import { securityTxt } from "./security-txt";

describe("security.txt (RFC 9116)", () => {
  it("names the contact, a year's freshness, the language and itself", () => {
    const text = securityTxt({
      contact: "privacy@example.com",
      canonical: "https://example.com/.well-known/security.txt",
      now: new Date("2026-10-20T08:30:00.123Z"),
    });
    expect(text).toBe(
      [
        "Contact: mailto:privacy@example.com",
        "Expires: 2027-10-20T08:30:00Z",
        "Preferred-Languages: en",
        "Canonical: https://example.com/.well-known/security.txt",
        "",
      ].join("\n"),
    );
  });
});
