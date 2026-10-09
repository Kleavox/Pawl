import { renderAppHeader } from "@pawl/ui";
import { describe, expect, it } from "vitest";

describe("the shared header on the identity tool", () => {
  it("wears the Pawl name while it is still keyed pass", () => {
    const target = document.createElement("header");
    renderAppHeader(target, { product: "pass" });
    expect(target.querySelector(".pw-brand b")?.textContent).toBe("/pawl");
    expect(target.querySelector('[aria-current="page"]')?.textContent).toBe(
      "pawl",
    );
  });

  it("keeps the other tools' names as they were", () => {
    const target = document.createElement("header");
    renderAppHeader(target, { product: "link" });
    expect(target.querySelector(".pw-brand b")?.textContent).toBe("/link");
  });
});
