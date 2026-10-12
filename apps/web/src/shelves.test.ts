import { describe, expect, it } from "vitest";
import type { BayView } from "@pawl/registry";

import { renderShelves } from "./shelves";

const BAYS: BayView[] = [
  {
    code: "2",
    key: "notes",
    estate: true,
    product: "NOTE",
    chars: 4,
    title: "Notes",
    access: "visitor",
    shape: "tall",
    href: "https://notes.example.test",
  },
  {
    code: "7",
    key: "docs",
    estate: false,
    product: "MANUAL",
    chars: 6,
    title: "Docs",
    access: "public",
    shape: "wide",
    href: "https://docs.example.test",
  },
];

function shelves(bays: BayView[] = BAYS): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = renderShelves(bays);
  return root;
}

describe("renderShelves", () => {
  it("always builds nine bays on three shelves", () => {
    const root = shelves();
    expect(root.querySelectorAll("[data-shelf]")).toHaveLength(3);
    expect(root.querySelectorAll("[data-bay]")).toHaveLength(9);
  });

  it("stands each app's cartridge on a coil, with its label and title on a sticker", () => {
    const bay = shelves().querySelector<HTMLElement>("[data-bay='2']")!;
    const cartridge = bay.querySelector<HTMLButtonElement>("[data-cartridge]")!;
    expect(cartridge.dataset.href).toBe("https://notes.example.test");
    expect(cartridge.classList.contains("cartridge--tall")).toBe(true);
    expect(bay.querySelector(".coil")).not.toBeNull();
    expect(bay.querySelector(".cartridge__name")!.textContent).toBe("NOTE");
    expect(bay.querySelector(".cartridge__title")!.textContent).toBe("Notes");
  });

  it("hangs a label rail under every bay with its two-digit code", () => {
    const root = shelves();
    const filled = root.querySelector("[data-bay='2'] [data-rail]")!;
    expect(filled.querySelector(".rail__code")!.textContent).toBe("02");
    expect(filled.querySelector(".rail__label")!.textContent).toBe("NOTE");
    const empty = root.querySelector("[data-bay='5'] [data-rail]")!;
    expect(empty.querySelector(".rail__code")!.textContent).toBe("05");
    expect(empty.querySelector(".rail__label")!.textContent).toBe("—");
  });

  it("starts an estate app's LED dark and a link app's LED pointing out", () => {
    const root = shelves();
    const estate = root.querySelector<HTMLElement>(
      "[data-bay='2'] [data-led]",
    )!;
    expect(estate.dataset.severity).toBe("none");
    expect(estate.textContent).toBe("—");
    const link = root.querySelector<HTMLElement>("[data-bay='7'] [data-led]")!;
    expect(link.dataset.severity).toBe("link");
    expect(link.textContent).toBe("OPEN ↗");
    expect(
      root.querySelector<HTMLElement>("[data-bay='7']")!.dataset.estate,
    ).toBe("false");
  });

  it("sizes the printed name by its length, not by which app it is", () => {
    const name = shelves().querySelector<HTMLElement>(
      "[data-bay='7'] .cartridge__name",
    )!;
    expect(name.style.getPropertyValue("--chars")).toBe("6");
  });

  it("leaves every other bay empty and out of the keyboard's way", () => {
    const root = shelves();
    const empties = root.querySelectorAll<HTMLElement>(".slot--empty");
    expect(empties).toHaveLength(7);
    for (const empty of empties) {
      expect(empty.getAttribute("aria-hidden")).toBe("true");
      expect(empty.querySelector("button")).toBeNull();
    }
  });

  it("names each shelf for what it holds", () => {
    const labels = [...shelves().querySelectorAll("[data-shelf]")].map(
      (shelf) => shelf.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "Bays 1 to 3, one application",
      "Bays 4 to 6, three empty bays",
      "Bays 7 to 9, one application",
    ]);
  });

  it("escapes what the manifest put in a title", () => {
    const root = shelves([
      { ...BAYS[0]!, title: '<img src=x onerror="alert(1)">' },
    ]);
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector(".cartridge__title")!.textContent).toContain(
      "<img",
    );
  });
});
