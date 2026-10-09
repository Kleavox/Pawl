import { renderAppHeader } from "@pawl/ui";
import { describe, expect, it } from "vitest";

describe("the shared header on the identity tool", () => {
  it("wears the site's name and the active tool's label", () => {
    const target = document.createElement("header");
    renderAppHeader(target, {
      product: "pass",
      siteName: "Example",
      tools: [
        {
          key: "pass",
          label: "pawl",
          noun: "devices",
          origin: "https://paw.example.test",
        },
        {
          key: "notes",
          label: "notes",
          noun: "notes",
          origin: "https://notes.example.test",
        },
      ],
    });
    expect(target.querySelector(".pw-brand")?.textContent).toBe("example/pawl");
    expect(target.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Example tools",
    );
    expect(target.querySelector('[aria-current="page"]')?.textContent).toBe(
      "pawl",
    );
  });
});
