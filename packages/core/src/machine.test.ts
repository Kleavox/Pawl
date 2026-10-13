import { describe, expect, it } from "vitest";

import { MACHINE_PARTS, renderMachine, type MachineOptions } from "./machine";

const BASE: MachineOptions = {
  siteName: "Pawl",
  rootOrigin: "https://example.com",
  framing: "whole",
  ticker: "WELCOME",
  chip: { state: "guest", word: "GUEST MODE" },
  display: "<p>screen</p>",
  lcd: { main: "PICK A BAY", sub: "OR SIGN IN" },
  keypad: { mode: "machine" },
};

function count(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0;
}

describe("renderMachine", () => {
  it("draws every part once, inside the camera, with no page chrome and no pass card", () => {
    const html = renderMachine(BASE);
    for (const part of MACHINE_PARTS) {
      expect(count(html, new RegExp(`data-part="${part}"`, "g")), part).toBe(1);
    }
    expect(html).toMatch(
      /class="room"[\s\S]*class="camera" data-camera data-framing="whole"[\s\S]*data-machine/,
    );
    expect(html).not.toMatch(
      /<header\b|<footer\b|pawl-card|data-reader|INSERT PASS|EJECT PASS/,
    );
  });

  it("carries the two arrival targets a #cam= hint can name, out of sight", () => {
    const html = renderMachine(BASE);
    expect(html).toContain('<i id="cam=screen" hidden></i>');
    expect(html).toContain('<i id="cam=printer" hidden></i>');
    expect(html.indexOf('id="cam=screen"')).toBeLessThan(
      html.indexOf('class="camera"'),
    );
  });

  it("is the page's main landmark unless the page says its content lives elsewhere", () => {
    expect(renderMachine(BASE)).toMatch(/^<main class="room"/);
    const aside = renderMachine({ ...BASE, main: false });
    expect(aside).not.toContain("<main");
    expect(aside).toMatch(
      /^<div class="room" role="region" aria-label="Pawl vending machine">/,
    );
  });

  it("can start settled, so a page without script never stays in a hinted framing", () => {
    expect(renderMachine(BASE)).not.toContain("data-settled");
    expect(renderMachine({ ...BASE, settled: true })).toContain(
      'data-camera data-framing="whole" data-settled',
    );
  });

  it("keeps the plate out of the keyboard's way when the camera frames only the screen", () => {
    expect(renderMachine({ ...BASE, framing: "screen" })).toContain(
      '<div class="plate" data-part="plate" inert>',
    );
    expect(renderMachine(BASE)).toContain(
      '<div class="plate" data-part="plate">',
    );
  });

  it("speaks the status from the LCD's live region", () => {
    expect(renderMachine(BASE)).toMatch(
      /data-part="lcd"[\s\S]*role="status"[\s\S]*data-screen>PICK A BAY<[\s\S]*data-screen-sub>OR SIGN IN</,
    );
  });

  it("gives the machine keypad twelve working keys with their braille cells", () => {
    const html = renderMachine(BASE);
    expect(count(html, /data-key="/g)).toBe(12);
    expect(count(html, /class="pw-braille"/g)).toBe(10);
    expect(html).toContain('data-keypad-mode="selector"');
    expect(html).toContain('data-keypad-mode="otp"');
  });

  it("gives a service keypad unlit digits and only the keys the page offers", () => {
    const html = renderMachine({
      ...BASE,
      framing: "screen",
      keypad: {
        mode: "service",
        clr: {
          kind: "submit",
          form: "consent",
          name: "decision",
          value: "deny",
        },
        go: { kind: "link", href: "/#cam=screen" },
        caption: "CLR DENY · GO ALLOW",
      },
    });
    expect(count(html, /class="pw-key is-unlit" aria-hidden="true"/g)).toBe(10);
    expect(html).toContain(
      'type="submit" form="consent" name="decision" value="deny" aria-describedby="keys-caption"',
    );
    expect(html).toContain(
      'href="/#cam=screen" aria-describedby="keys-caption"',
    );
    expect(html).toContain('id="keys-caption"');
    expect(html).toContain('data-framing="screen"');
    expect(html).toContain(
      '<p class="keypad__mode keypad__caption" id="keys-caption">CLR DENY · GO ALLOW</p>',
    );
    expect(html).not.toContain("Service</span>");
  });

  it("leaves a service key unlit when the page has nothing for it", () => {
    const html = renderMachine({ ...BASE, keypad: { mode: "service" } });
    expect(count(html, /class="pw-key is-unlit" aria-hidden="true"/g)).toBe(12);
  });

  it("names the site on the marquee and links the receipts on the plate", () => {
    const html = renderMachine({ ...BASE, headingBrand: true, sound: true });
    expect(html).toMatch(/<h1 class="marquee__brand">PAWL<\/h1>/);
    expect(html).toContain('href="https://example.com/privacy.html"');
    expect(html).toContain('href="https://example.com/terms.html"');
    expect(html).toContain("data-sound");
    expect(renderMachine(BASE)).not.toContain("data-sound");
    expect(renderMachine(BASE)).toMatch(/<p class="marquee__brand">PAWL<\/p>/);
  });

  it("escapes what it is given and passes the display through as written", () => {
    const html = renderMachine({
      ...BASE,
      siteName: "<b>x</b>",
      ticker: "<i>t</i>",
      lcd: { main: "<s>", sub: "&" },
      chip: { state: "guest", word: "<u>" },
      display: "<em>ok</em>",
    });
    expect(html).not.toMatch(/<b>x<\/b>|<i>t<\/i>|<s>|<u>/);
    expect(html).toContain("<em>ok</em>");
  });

  it("hangs a sign over the screen when there is one", () => {
    expect(renderMachine({ ...BASE, sign: "OUT OF ORDER" })).toMatch(
      /class="bezel__sign" aria-hidden="true">OUT OF ORDER</,
    );
  });

  it("carries the attributes a page sets on the machine, escaped", () => {
    const html = renderMachine({
      ...BASE,
      machine: { "data-access": "guest", "data-view": 'x"y' },
    });
    expect(html).toContain('data-access="guest"');
    expect(html).toContain('data-view="x&quot;y"');
  });

  it("puts what a page gives the delivery bay inside it", () => {
    expect(
      renderMachine({
        ...BASE,
        tray: "<button data-tray-action>TAKE</button>",
      }),
    ).toMatch(/data-part="tray"[\s\S]*data-tray-action/);
  });
});
