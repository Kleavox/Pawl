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
  it("renders the glitch code element and derives generic copy from the code", () => {
    const html = renderErrorPage({ code: "403" });
    expect(html).toContain('data-code="403"');
    expect(html).toContain("Access denied");
    expect(html).toContain("pw-glitch-a");
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
    expect(html).not.toContain('<div class="pw-error-code"');
  });
});
