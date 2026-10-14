import { describe, expect, it } from "vitest";

import { injectApp } from "./prerender";

describe("injectApp", () => {
  it("puts the rendered page where the template's slot is", () => {
    expect(
      injectApp(
        '<body><div id="root"><!--app--></div></body>',
        "<main>m</main>",
      ),
    ).toBe('<body><div id="root"><main>m</main></div></body>');
  });

  it("keeps dollar signs in the page as written", () => {
    expect(injectApp("<!--app-->", "<p>$& $1</p>")).toBe("<p>$& $1</p>");
  });

  it("refuses a template with no slot, so a page is never shipped empty", () => {
    expect(() => injectApp("<body></body>", "<p></p>")).toThrow(/<!--app-->/);
  });
});
