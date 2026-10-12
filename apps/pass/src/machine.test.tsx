import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Machine, initialMode } from "./machine";

function markup(element: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(element);
}

const BASE = {
  siteName: "Pawl",
  rootOrigin: "https://example.com",
  status: "SIGN IN",
  sub: "CHOOSE A METHOD",
};

describe("the panel close-up", () => {
  it("keeps the digit keys unlit: no buttons, hidden from assistive tech", () => {
    const html = markup(
      <Machine {...BASE} go back={() => undefined} holder={null}>
        <p>view</p>
      </Machine>,
    );
    const digits =
      html.match(/<span class="pw-key[^"]*"[^>]*>\d<\/span>/g) ?? [];
    expect(digits).toHaveLength(10);
    for (const digit of digits) expect(digit).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<button[^>]*>\d<\/button>/);
  });

  it("makes GO submit the screen's form, and only when there is one", () => {
    const ready = markup(
      <Machine {...BASE} go holder={null}>
        <p>view</p>
      </Machine>,
    );
    expect(ready).toMatch(
      /<button[^>]*type="submit"[^>]*form="screen-form"[^>]*>GO<\/button>/,
    );
    const idle = markup(
      <Machine {...BASE} go={false} holder={null}>
        <p>view</p>
      </Machine>,
    );
    expect(idle).toMatch(/<button[^>]*disabled=""[^>]*>GO<\/button>/);
  });

  it("lights CLR only when the view has somewhere to go back to", () => {
    const without = markup(
      <Machine {...BASE} go={false} holder={null}>
        <p>view</p>
      </Machine>,
    );
    expect(without).toMatch(/<button[^>]*disabled=""[^>]*>CLR<\/button>/);
    const withBack = markup(
      <Machine {...BASE} go={false} back={() => undefined} holder={null}>
        <p>view</p>
      </Machine>,
    );
    expect(withBack).not.toMatch(/<button[^>]*disabled=""[^>]*>CLR<\/button>/);
  });

  it("puts the pass in the reader only for a signed-in person", () => {
    const guest = markup(
      <Machine {...BASE} go={false} holder={null}>
        <p>view</p>
      </Machine>,
    );
    expect(guest).toContain("GUEST MODE");
    expect(guest).not.toContain("pawl-card__holder");
    const owner = markup(
      <Machine
        {...BASE}
        go={false}
        holder={{ handle: "annisa", role: "ADMIN" }}
      >
        <p>view</p>
      </Machine>,
    );
    expect(owner).toContain("OWNER MODE");
    expect(owner).toContain("annisa");
    expect(owner).toContain("OWNER PASS");
  });

  it("links both receipts on the cabinet's origin and has no page header or footer", () => {
    const html = markup(
      <Machine {...BASE} go={false} holder={null}>
        <p>view</p>
      </Machine>,
    );
    expect(html).toContain('href="https://example.com/privacy.html"');
    expect(html).toContain('href="https://example.com/terms.html"');
    expect(html).not.toMatch(/<header\b|<footer\b/);
  });
});

describe("initialMode", () => {
  it("opens the register view when the cabinet asked for it", () => {
    expect(initialMode("?mode=register&returnTo=x")).toBe("register");
    expect(initialMode("?mode=forgot")).toBe("forgot");
    expect(initialMode("")).toBe("login");
    expect(initialMode("?mode=anything")).toBe("login");
  });
});
