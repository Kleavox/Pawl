import { describe, expect, it } from "vitest";

import { errorCodeCopy, renderErrorPage } from "./error-page";

describe("errorCodeCopy", () => {
  it("returns generic, app-agnostic copy per known status", () => {
    expect(errorCodeCopy("403")).toEqual({
      title: "Access denied",
      message: "You don't have permission to view this page.",
    });
    expect(errorCodeCopy("404").title).toBe("Page not found");
    expect(errorCodeCopy("503").title).toBe("Service unavailable");
  });

  it("falls back for unknown or absent code", () => {
    expect(errorCodeCopy("799").title).toBe("Something went wrong");
    expect(errorCodeCopy().title).toBe("Something went wrong");
  });
});

describe("renderErrorPage", () => {
  it("shows the code in LED numerals on the machine's screen, with generic copy", () => {
    const html = renderErrorPage({ code: "403" });
    expect(html).toContain('<div class="page-led" data-code="403">403</div>');
    expect(html).not.toContain('class="led"');
    expect(html).toContain('data-code="403"');
    expect(html).toContain("Access denied");
    expect(html).toContain("FAULT 403");
    expect(html).not.toMatch(/<header|<footer/);
  });

  it("captions GO in words short enough for the keypad's lamp row", () => {
    expect(renderErrorPage({ code: "404" })).toContain(
      'id="keys-caption">GO · TO THE MACHINE</p>',
    );
  });

  it("puts a short word on the screen's bar that fits a phone", () => {
    expect(renderErrorPage({ code: "404" })).toContain(
      '<div class="page-bar"><span>EMPTY BAY</span>',
    );
    expect(renderErrorPage({ code: "500" })).toContain(
      '<div class="page-bar"><span>OUT OF ORDER</span>',
    );
    expect(renderErrorPage({ code: "403" })).toContain(
      '<div class="page-bar"><span>FAULT 403</span>',
    );
  });

  it("says an empty bay for a 404 and hangs an out-of-order card for a 5xx", () => {
    expect(renderErrorPage({ code: "404" })).toContain("NOTHING IN THIS BAY");
    expect(renderErrorPage({ code: "404" })).not.toContain(
      'class="bezel__sign"',
    );
    const broken = renderErrorPage({ code: "500" });
    expect(broken).toContain('class="bezel__sign"');
    expect(broken).toContain("OUT OF ORDER");
  });

  it("leads home with both the button and the GO key, arriving on the machine's screen framing", () => {
    const html = renderErrorPage({ code: "404", homeHref: "/home" });
    expect(html).toMatch(
      /<a class="[^"]*key--go[^"]*" href="\/home#cam=screen" aria-describedby="keys-caption">GO<\/a>/,
    );
    expect(html).toContain(
      '<a class="button button--primary" href="/home#cam=screen">Back to the machine</a>',
    );
  });

  it("sends a home elsewhere exactly as given", () => {
    const html = renderErrorPage({
      code: "404",
      homeHref: "https://other.example/",
    });
    expect(html).toContain('href="https://other.example/"');
    expect(html).not.toContain("other.example/#cam");
  });

  it("lets callers override the generic title/message", () => {
    const html = renderErrorPage({
      code: "410",
      title: "Link expired",
      message: "Gone for good.",
    });
    expect(html).toContain("Link expired");
    expect(html).toContain("Gone for good.");
  });

  it("omits the code element when no code is given", () => {
    const html = renderErrorPage({ title: "Whoops", message: "No code here." });
    expect(html).not.toContain('class="led"');
  });
});
