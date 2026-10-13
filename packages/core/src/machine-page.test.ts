import { describe, expect, it } from "vitest";

import { MACHINE_CSS } from "./machine-css";
import { MACHINE_PARTS } from "./machine";
import { MACHINE_PAGE_CSS, renderMachinePage } from "./machine-page";

const CONSENT_KEYS = {
  clr: {
    kind: "submit" as const,
    form: "consent",
    name: "decision",
    value: "deny",
  },
  go: {
    kind: "submit" as const,
    form: "consent",
    name: "decision",
    value: "allow",
  },
};

describe("renderMachinePage", () => {
  it("draws the one shared machine, framed on its screen, with no script and no page chrome", () => {
    const html = renderMachinePage({
      title: "Hello",
      status: "READY",
      body: "<h1>Hi</h1>",
      siteName: "Fixture",
      rootOrigin: "https://example.test",
    });
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>Hello</title>");
    for (const part of MACHINE_PARTS) {
      expect(
        html.match(new RegExp(`data-part="${part}"`, "g")),
        part,
      ).toHaveLength(1);
    }
    expect(html).toContain('data-camera data-framing="screen"');
    expect(html).not.toMatch(
      /<script\b|<header\b|<footer\b|pawl-card|PASS DOCK/,
    );
    expect(html).toContain("<h1>Hi</h1>");
  });

  it("inlines the machine's own stylesheet and the screen's, nothing else", () => {
    const html = renderMachinePage({ title: "x", status: "y", body: "" });
    expect(html).toContain(
      `<style>${MACHINE_CSS}\n${MACHINE_PAGE_CSS}</style>`,
    );
    expect(html).not.toMatch(/<link\b/);
  });

  it("speaks its status from the LCD", () => {
    const html = renderMachinePage({
      title: "Consent",
      status: "AN APP WANTS YOUR PASS",
      sub: "NOTHING SHARED YET",
      body: "",
    });
    expect(html).toMatch(
      /<span class="lcd__main" data-screen>AN APP WANTS YOUR PASS<\/span><small class="lcd__sub" data-screen-sub>NOTHING SHARED YET<\/small>/,
    );
  });

  it("makes CLR and GO real submit buttons of the page's form, described by their caption", () => {
    const html = renderMachinePage({
      title: "Consent",
      status: "CONSENT",
      body: '<form id="consent"></form>',
      caption: "CLR DENY · GO ALLOW",
      keys: CONSENT_KEYS,
    });
    expect(html).toMatch(
      /<button class="[^"]*key--fn[^"]*" type="submit" form="consent" name="decision" value="deny" aria-describedby="keys-caption">CLR<\/button>/,
    );
    expect(html).toMatch(
      /<button class="[^"]*key--go[^"]*" type="submit" form="consent" name="decision" value="allow" aria-describedby="keys-caption">GO<\/button>/,
    );
    expect(html).toContain('id="keys-caption">CLR DENY · GO ALLOW</p>');
  });

  it("makes GO a link when there is nothing to submit, and leaves CLR and the digits unlit", () => {
    const html = renderMachinePage({
      title: "Lost",
      status: "LOST",
      body: "",
      keys: { go: { kind: "link", href: "/#cam=screen" } },
    });
    expect(html).toMatch(
      /<a class="[^"]*key--go[^"]*" href="\/#cam=screen">GO<\/a>/,
    );
    expect(html).toContain(
      '<span class="pw-key is-unlit" aria-hidden="true">CLR</span>',
    );
    expect(html).not.toMatch(/<button[^>]*>\d<\/button>/);
  });

  it("hangs a sign over the screen when asked, escaped", () => {
    const html = renderMachinePage({
      title: "Broken",
      status: "FAULT",
      body: "",
      sign: "OUT <OF> ORDER",
    });
    expect(html).toContain(
      'class="bezel__sign" aria-hidden="true">OUT &lt;OF&gt; ORDER</span>',
    );
  });

  it("offers the way back to the machine on the screen's bar, arriving on the screen framing", () => {
    const html = renderMachinePage({
      title: "x",
      status: "y",
      body: "",
      rootOrigin: "https://example.test",
    });
    expect(html).toContain('href="https://example.test/#cam=screen"');
  });

  it("starts settled, so a hint in the address never leaves a script-less page zoomed elsewhere", () => {
    const html = renderMachinePage({ title: "x", status: "y", body: "" });
    expect(html).toContain('data-camera data-framing="screen" data-settled');
  });

  it("names the screen's bar with the short word the page gives, falling back to the status", () => {
    expect(
      renderMachinePage({
        title: "x",
        status: "AN APP WANTS YOUR PASS",
        where: "CONSENT",
        body: "",
      }),
    ).toContain('<div class="page-bar"><span>CONSENT</span>');
    expect(
      renderMachinePage({ title: "x", status: "LOST", body: "" }),
    ).toContain('<div class="page-bar"><span>LOST</span>');
  });

  it("keeps every line of the page at its own height and clear of a hanging sign", () => {
    expect(MACHINE_PAGE_CSS).toContain(".page-view>*{flex-shrink:0}");
    expect(MACHINE_PAGE_CSS).toMatch(
      /\.bezel:has\(\.bezel__sign\) \.page-view\{padding-top:/,
    );
  });

  it("styles the screen with the design tokens only, never a raw colour", () => {
    expect(MACHINE_PAGE_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
    expect(MACHINE_PAGE_CSS).toContain("var(--u)");
  });
});
