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
    expect(html).toContain('data-code="403"');
    expect(html).toContain("Access denied");
    expect(html).toContain("FAULT 403");
    expect(html).not.toMatch(/<header|<footer/);
  });

  it("says an empty bay for a 404 and hangs an out-of-order card for a 5xx", () => {
    expect(renderErrorPage({ code: "404" })).toContain("NOTHING IN THIS BAY");
    expect(renderErrorPage({ code: "404" })).not.toContain('class="sign"');
    const broken = renderErrorPage({ code: "500" });
    expect(broken).toContain('class="sign"');
    expect(broken).toContain("OUT OF ORDER");
  });

  it("leads home with both the button and the GO key", () => {
    const html = renderErrorPage({ code: "404", homeHref: "/home" });
    expect(html).toContain(
      '<a class="key key--go" href="/home" aria-describedby="keys-caption">GO</a>',
    );
    expect(html).toContain("Back to the machine");
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
