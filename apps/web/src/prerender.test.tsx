import type { PublicView } from "@pawl/registry";
import { CAMERA_HINT_SCRIPT, MACHINE_PARTS } from "@pawl/ui";
import { describe, expect, it } from "vitest";

import { CATALOG } from "./machine/catalog.testkit";
import { renderPage } from "./prerender";

const SITE: PublicView = {
  site: { name: "Fixture" },
  tools: [],
  bays: CATALOG,
  footer: [],
};

const PAGE = {
  passHref: "https://paw.example.test",
  rootHost: "example.test",
  passHost: "paw.example.test",
};

describe("renderPage", () => {
  it("prerenders each page with the whole machine and no dynamic data", () => {
    for (const page of ["cabinet", "privacy", "terms"] as const) {
      const html = renderPage(page, SITE, PAGE);
      for (const part of MACHINE_PARTS) {
        expect(html, `${page} ${part}`).toContain(`data-part="${part}"`);
      }
      expect(html).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}|GMT/);
    }
  });

  it("puts the camera hint on the cabinet only; a receipt takes none", () => {
    expect(renderPage("cabinet", SITE, PAGE)).toContain(
      `<script>${CAMERA_HINT_SCRIPT}</script>`,
    );
    expect(renderPage("privacy", SITE, PAGE)).not.toContain("<script>");
    expect(renderPage("terms", SITE, PAGE)).not.toContain("<script>");
  });

  it("prints the right receipt on each receipt page", () => {
    expect(renderPage("privacy", SITE, PAGE)).toContain("Privacy policy");
    expect(renderPage("terms", SITE, PAGE)).toContain("Terms of service");
    expect(renderPage("cabinet", SITE, PAGE)).toContain(
      'data-view-panel="products"',
    );
  });
});
