import { describe, expect, it } from "vitest";

import { LCD_FIT, MACHINE_PARTS } from "../machine/parts";
import { PAGE_CSS } from "../page-css";
import { errorCodeCopy, renderConsentPage, renderErrorPage } from "./index";

const CONSENT = {
  clientName: "Docs <beta>",
  sector: "docs.example",
  holder: "ana_01",
  scopes: ["Your email address", "Your username"],
  query: 'client_id=docs&state=a"b',
  rootOrigin: "https://example.test",
  siteName: "Fixture",
};

describe("errorCodeCopy", () => {
  it("returns generic, app-agnostic copy per known status", () => {
    expect(errorCodeCopy("403")).toEqual({
      title: "Access denied",
      message: "You do not have permission to view this page.",
    });
    expect(errorCodeCopy("404").title).toBe("Page not found");
    expect(errorCodeCopy("503").title).toBe("Service unavailable");
  });

  it("falls back for unknown or absent code", () => {
    expect(errorCodeCopy("799").title).toBe("Something went wrong");
    expect(errorCodeCopy().title).toBe("Something went wrong");
  });
});

describe("the Worker's pages", () => {
  it("draw the one shared machine, framed on its screen, with no script and no page chrome", () => {
    for (const html of [
      renderErrorPage({ code: "404" }),
      renderConsentPage(CONSENT),
    ]) {
      expect(html).toMatch(/^<!doctype html>/);
      for (const part of MACHINE_PARTS) {
        expect(
          html.match(new RegExp(`data-part="${part}"`, "g")),
          part,
        ).toHaveLength(1);
      }
      expect(html).toContain('data-framing="screen"');
      expect(html).toContain('<meta name="robots" content="noindex"/>');
      expect(html).not.toMatch(
        /<script\b|<header\b|<footer\b|<link\b|pawl-card|PASS DOCK/,
      );
    }
  });

  it("show the status code on the credit display, and FrEE where nothing is wrong", () => {
    expect(renderErrorPage({ code: "404" })).toContain('data-credit="404"');
    expect(renderErrorPage({ code: "500" })).toContain('data-credit="500"');
    expect(renderErrorPage({})).toContain('data-credit="----"');
    expect(renderConsentPage(CONSENT)).toContain('data-credit="FrEE"');
  });

  it("inline the compiled theme and nothing else", () => {
    expect(renderErrorPage({ code: "404" })).toContain(
      `<style>${PAGE_CSS}</style>`,
    );
  });

  it("offer the way back to the machine on the screen's bar, arriving on the screen framing", () => {
    expect(renderConsentPage(CONSENT)).toMatch(
      /href="https:\/\/example.test\/#cam=screen"[^>]*>‹ Machine</,
    );
  });
});

describe("renderErrorPage", () => {
  it("shows the code in LED numerals on the machine's screen, with generic copy", () => {
    const html = renderErrorPage({ code: "403" });
    expect(html).toMatch(/data-code="403"[^>]*>403</);
    expect(html).toContain("Access denied");
    expect(html).toContain("<title>Access denied · Pawl</title>");
    expect(html).toMatch(/data-screen[^>]*>FAULT 403</);
  });

  it("captions GO in words short enough for the keypad's lamp row", () => {
    expect(renderErrorPage({ code: "404" })).toMatch(
      /id="keys-caption">GO to the machine<\/p>/,
    );
  });

  it("puts a short word on the screen's bar that fits a phone", () => {
    const bar = (code: string) =>
      /data-page-bar[^>]*><span[^>]*>([^<]*)</.exec(
        renderErrorPage({ code }),
      )?.[1];
    expect(bar("404")).toBe("EMPTY BAY");
    expect(bar("500")).toBe("OUT OF ORDER");
    expect(bar("403")).toBe("FAULT 403");
  });

  it("writes every LCD line on one line of the LCD, and the same word on the bar", () => {
    const line = (html: string, mark: string) =>
      new RegExp(`${mark}[^>]*>([^<]*)<`).exec(html)?.[1] ?? "";
    for (const code of [
      "400",
      "401",
      "403",
      "404",
      "410",
      "429",
      "500",
      "503",
    ]) {
      const html = renderErrorPage({ code });
      const main = line(html, "data-screen");
      expect(main.length, main).toBeLessThanOrEqual(LCD_FIT.main);
      expect(line(html, "data-screen-sub").length).toBeLessThanOrEqual(
        LCD_FIT.sub,
      );
      expect(line(html, "data-page-bar[^>]*><span")).toBe(main);
    }
  });

  it("says an empty bay for a 404 and hangs an out-of-order card for a 5xx", () => {
    expect(renderErrorPage({ code: "404" })).toMatch(
      /data-screen[^>]*>EMPTY BAY</,
    );
    expect(renderErrorPage({ code: "404" })).not.toContain("bezel__sign");
    const broken = renderErrorPage({ code: "500" });
    expect(broken).toContain("bezel__sign");
    expect(broken).toContain("OUT OF ORDER");
  });

  it("leads home with both the button and the GO key, arriving on the machine's screen framing", () => {
    const html = renderErrorPage({ code: "404", homeHref: "/home" });
    expect(html).toMatch(
      /<a class="[^"]*key--go[^"]*" href="\/home#cam=screen" aria-describedby="keys-caption">GO<span[^>]*data-tactile="circle"[^>]*><\/span><\/a>/,
    );
    expect(html).toMatch(
      /<a class="[^"]*" href="\/home#cam=screen" data-home="">Back to the machine<\/a>/,
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

  it("lets callers override the generic title and message, escaped", () => {
    const html = renderErrorPage({
      code: "410",
      title: "Link <expired>",
      message: "Gone for good.",
    });
    expect(html).toContain("Link &lt;expired&gt;");
    expect(html).toContain("Gone for good.");
  });

  it("omits the LED when no code is given", () => {
    const html = renderErrorPage({ title: "Whoops", message: "No code here." });
    expect(html).not.toContain("data-code=");
  });
});

describe("renderConsentPage", () => {
  it("names the app, its sector, the holder and what it receives, escaped", () => {
    const html = renderConsentPage(CONSENT);
    expect(html).toContain("Sign in to Docs &lt;beta&gt; with Pawl");
    expect(html).toContain("docs.example");
    expect(html).toContain("ana_01");
    expect(html).toContain("<li");
    expect(html).toContain("Your username");
    expect(html).toMatch(/data-screen[^>]*>CONSENT</);
    expect(html).toMatch(/data-screen-sub[^>]*>NOTHING SHARED YET</);
  });

  it("posts the request back with the decision, from the buttons and from CLR and GO", () => {
    const html = renderConsentPage(CONSENT);
    const tag = (pattern: RegExp) => pattern.exec(html)?.[0] ?? "";
    const form = tag(/<form id="consent"[^>]*>/);
    expect(form).toContain('method="post"');
    expect(form).toContain('action="/oauth/consent"');
    expect(html).toContain(
      '<input type="hidden" name="request" value="client_id=docs&amp;state=a&quot;b"/>',
    );
    for (const [label, value, key] of [
      ["Deny", "deny", null],
      ["Allow", "allow", null],
      ["CLR", "deny", "key--fn"],
      ["GO", "allow", "key--go"],
    ] as const) {
      const button = tag(
        new RegExp(
          `<button[^>]*>${label}(?:<(?:span|svg)[^>]*data-tactile[\\s\\S]*?)?</button>`,
        ),
      );
      expect(button, label).toContain('type="submit"');
      expect(button, label).toContain('name="decision"');
      expect(button, label).toContain(`value="${value}"`);
      if (key !== null) {
        expect(button, label).toContain(key);
        expect(button, label).toContain('form="consent"');
        expect(button, label).toContain('aria-describedby="keys-caption"');
      }
    }
    expect(html).toMatch(/id="keys-caption">CLR deny · GO allow<\/p>/);
  });
});
