import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { contactAddress } from "./legal-facts";

function page(name: string): string {
  return readFileSync(resolve(process.cwd(), name), "utf8").replace(
    /\s+/g,
    " ",
  );
}

const privacy = page("privacy.html");
const terms = page("terms.html");

describe("both receipts", () => {
  it.each([
    ["privacy.html", privacy, "{{MACHINE_PRIVACY}}"],
    ["terms.html", terms, "{{MACHINE_TERMS}}"],
  ])(
    "%s is a receipt hanging from the machine's printer, not a page with a header and a footer",
    (_, html, machine) => {
      expect(html).toContain(machine);
      expect(html).toMatch(
        /<main class="receipt-feed" aria-labelledby="receipt-title">\s*<article class="receipt" data-receipt/,
      );
      expect(html).toMatch(
        /<a [^>]*data-tear[^>]*href="\/"|<a [^>]*href="\/"[^>]*data-tear/,
      );
      expect(html).toMatch(
        /<div class="receipt__head">[\s\S]*?<a class="receipt__tear-top" href="\/" data-tear>/,
      );
      expect(html).not.toContain("{{MARQUEE_RECEIPT}}");
      expect(html).not.toContain("{{PLATE}}");
      expect(html).not.toMatch(/<header\b/);
      expect(html).not.toMatch(/<footer\b/);
      expect(html).toContain("{{EFFECTIVE}}");
      expect(html).toContain("mailto:{{CONTACT_EMAIL}}");
      expect(html).toContain('href="/"');
    },
  );

  it("send privacy requests to an address on the site's own domain", () => {
    expect(contactAddress("example.com")).toBe("privacy@example.com");
    expect(contactAddress("127.0.0.1:8786")).toBe("privacy@127.0.0.1");
  });
});

describe("the privacy policy says what the code does", () => {
  it.each([
    "openid email profile",
    "read:user user:email",
    "__Secure-pawl_session",
    "__Secure-pawl_verified",
    "__Secure-pawl_oauth",
    "__Host-session",
    "__Host-signin",
    "__Host-silent",
    "pawl:sound",
    "7 days",
    "10 minutes",
    "30 minutes",
    "15 minutes",
    "60 seconds",
    "30 days",
    "salted hash",
    "Cloudflare",
    "Turnstile",
    "Resend",
    "Delete this account",
    "never reaches",
    "not sold",
    "13",
    "IP address it was created from",
  ])("mentions %s", (fact) => {
    expect(privacy).toContain(fact);
  });

  it.each([
    ["the raw IP is never kept", "never store the IP address"],
    ["sessions record when they were last used", "last used"],
    ["the cabinet caches counts in pawl:overview", "pawl:overview"],
    ["HTTPS is end to end", "end to end"],
  ])("does not claim %s", (_claim, words) => {
    expect(privacy).not.toContain(words);
  });
});

describe("the terms cover what an account holder agrees to", () => {
  it.each([
    "Acceptable use",
    "Apps you connect",
    "Google or GitHub",
    "as is",
    "Limitation of liability",
    "Ending your account",
    "Changes to these terms",
    "cannot recover",
  ])("covers %s", (clause) => {
    expect(terms).toContain(clause);
  });
});
