import { describe, expect, it } from "vitest";

import { renderShelves } from "./shelves";

const BAYS = [
  {
    code: "2",
    product: "NOTE",
    chars: 4,
    title: "Notes",
    access: "visitor",
    shape: "tall",
    href: "https://notes.example.test",
  },
  {
    code: "7",
    product: "MANUAL",
    chars: 6,
    title: "Docs",
    access: "public",
    shape: "wide",
    href: "https://docs.example.test",
  },
] as const;

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("renderShelves", () => {
  it("always builds nine bays on three shelves", () => {
    const root = mount(renderShelves([...BAYS]));
    expect(root.querySelectorAll("[data-shelf]")).toHaveLength(3);
    expect(root.querySelectorAll("[data-bay]")).toHaveLength(9);
  });

  it("fills a placed bay with a cartridge that carries its shape and link", () => {
    const button = mount(renderShelves([...BAYS])).querySelector<HTMLElement>(
      "[data-cartridge='7']",
    );
    expect(button?.classList.contains("cartridge--wide")).toBe(true);
    expect(button?.dataset.href).toBe("https://docs.example.test");
    expect(button?.textContent).toContain("MANUAL");
  });

  it("sizes the printed name by its length, not by which app it is", () => {
    const root = mount(renderShelves([...BAYS]));
    const name = (code: string) =>
      root
        .querySelector<HTMLElement>(
          `[data-cartridge='${code}'] .cartridge__name`,
        )
        ?.style.getPropertyValue("--chars");
    expect(name("2")).toBe("4");
    expect(name("7")).toBe("6");
  });

  it("puts the filled bays where the registry placed them", () => {
    const root = mount(renderShelves([...BAYS]));
    expect(
      root.querySelector("[data-bay='2'] [data-cartridge='2']"),
    ).not.toBeNull();
    expect(
      root.querySelector("[data-bay='7'] [data-cartridge='7']"),
    ).not.toBeNull();
  });

  it("leaves every other bay empty and out of the keyboard's way", () => {
    const empties = mount(renderShelves([...BAYS])).querySelectorAll(
      "[data-bay]:not(:has([data-cartridge]))",
    );
    expect(empties).toHaveLength(7);
    for (const empty of empties) {
      expect(empty.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("escapes what the manifest put in a title", () => {
    const html = renderShelves([{ ...BAYS[0], title: 'N<script>"' }]);
    expect(html).not.toContain("<script>");
  });
});
