import { describe, expect, it } from "vitest";

import { renderMachinePage } from "./machine-page";

describe("renderMachinePage", () => {
  it("draws the panel close-up with no page header or footer", () => {
    const html = renderMachinePage({
      title: "Hello",
      status: "READY",
      body: "<h1>Hi</h1>",
    });
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>Hello</title>");
    expect(html).toContain("READY");
    expect(html).toContain("<h1>Hi</h1>");
    expect(html).not.toMatch(/<header\b|<footer\b/);
    expect(html).toContain("PAWL-GW-01");
  });

  it("makes CLR and GO real submit buttons of a form when the page has one", () => {
    const html = renderMachinePage({
      title: "Consent",
      status: "CONSENT",
      body: '<form id="consent"></form>',
      keys: {
        clr: {
          kind: "submit",
          form: "consent",
          name: "decision",
          value: "deny",
        },
        go: {
          kind: "submit",
          form: "consent",
          name: "decision",
          value: "allow",
        },
      },
    });
    expect(html).toContain(
      '<button class="key" type="submit" form="consent" name="decision" value="deny">CLR</button>',
    );
    expect(html).toContain(
      '<button class="key key--go" type="submit" form="consent" name="decision" value="allow">GO</button>',
    );
  });

  it("tells assistive tech what CLR and GO do when a caption names it", () => {
    const html = renderMachinePage({
      title: "Consent",
      status: "CONSENT",
      body: '<form id="consent"></form>',
      caption: "CLR DENY · GO ALLOW",
      keys: {
        clr: {
          kind: "submit",
          form: "consent",
          name: "decision",
          value: "deny",
        },
        go: {
          kind: "submit",
          form: "consent",
          name: "decision",
          value: "allow",
        },
      },
    });
    expect(html).toContain('<p class="caption" id="keys-caption">');
    const described =
      html.match(
        /<button[^>]*aria-describedby="keys-caption"[^>]*>(CLR|GO)<\/button>/g,
      ) ?? [];
    expect(described).toHaveLength(2);
  });

  it("makes GO a link home when there is nothing to submit, and leaves CLR unlit", () => {
    const html = renderMachinePage({
      title: "Lost",
      status: "LOST",
      body: "",
      keys: { go: { kind: "link", href: "/" } },
    });
    expect(html).toContain('<a class="key key--go" href="/">GO</a>');
    expect(html).toMatch(
      /<span class="key is-unlit" aria-hidden="true">CLR<\/span>/,
    );
  });

  it("hangs an out-of-order card when asked, and escapes it", () => {
    const html = renderMachinePage({
      title: "Broken",
      status: "FAULT",
      body: "",
      sign: "OUT <OF> ORDER",
    });
    expect(html).toContain("OUT &lt;OF&gt; ORDER");
    expect(html).toContain('class="sign"');
  });
});
