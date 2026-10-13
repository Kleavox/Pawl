import { describe, expect, it } from "vitest";
import type { BayView } from "@pawl/registry";

import { renderTiles } from "./tiles";

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

function tiles(bays: BayView[] = BAYS): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = renderTiles(bays);
  return root;
}

describe("renderTiles", () => {
  it("always draws nine tiles, in bay order", () => {
    const codes = [...tiles().querySelectorAll<HTMLElement>("[data-tile]")].map(
      (tile) => tile.dataset.tile,
    );
    expect(codes).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });

  it("makes a stocked tile one button carrying the app's address, code, art and name", () => {
    const tile = tiles().querySelector<HTMLElement>("[data-tile='2']")!;
    expect(tile.dataset.state).toBe("idle");
    const button = tile.querySelector<HTMLButtonElement>("[data-cartridge]")!;
    expect(button.tagName).toBe("BUTTON");
    expect(button.type).toBe("button");
    expect(button.dataset.cartridge).toBe("2");
    expect(button.dataset.href).toBe("https://notes.example.test");
    expect(button.getAttribute("aria-label")).toBe("Select Notes, bay 2");
    expect(tile.querySelector(".tile__code")!.textContent).toBe("02");
    expect(tile.querySelector(".tile__name")!.textContent).toBe("NOTE");
    expect(tile.querySelector(".tile__art--tall")).not.toBeNull();
  });

  it("starts an estate app's badge at a dash, never at 0, and a link app's badge pointing out", () => {
    const root = tiles();
    const estate = root.querySelector<HTMLElement>(
      "[data-tile='2'] [data-badge]",
    )!;
    expect(estate.textContent).toBe("—");
    expect(estate.dataset.severity).toBe("none");
    const link = root.querySelector<HTMLElement>(
      "[data-tile='7'] [data-badge]",
    )!;
    expect(link.textContent).toBe("OPEN ↗");
    expect(link.dataset.severity).toBe("link");
  });

  it("leaves an empty bay dim, silent and out of the keyboard's way", () => {
    const root = tiles();
    const empties = root.querySelectorAll<HTMLElement>(".tile--empty");
    expect(empties).toHaveLength(7);
    for (const empty of empties) {
      expect(empty.getAttribute("aria-hidden")).toBe("true");
      expect(empty.querySelector("button")).toBeNull();
      expect(empty.querySelector(".tile__name")!.textContent).toBe("—");
    }
  });

  it("escapes what the manifest put in a title or a name", () => {
    const root = tiles([
      {
        ...BAYS[0]!,
        title: '<img src=x onerror="alert(1)">',
        product: "<b>X</b>",
      },
    ]);
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("b")).toBeNull();
    expect(
      root.querySelector("[data-cartridge]")!.getAttribute("aria-label"),
    ).toContain("<img");
  });
});
