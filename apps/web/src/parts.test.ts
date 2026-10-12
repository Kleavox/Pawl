import { describe, expect, it } from "vitest";

import { renderMarquee, renderPlate } from "./parts";

function html(markup: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = markup;
  return root;
}

describe("the marquee", () => {
  it("carries the wordmark, the ticker and the pass chip", () => {
    const root = html(renderMarquee("Pawl", "WELCOME TO PAWL"));
    expect(root.querySelector("h1")!.textContent).toBe("PAWL");
    expect(root.querySelector("[data-ticker-text]")!.textContent).toBe(
      "WELCOME TO PAWL",
    );
    const chip = root.querySelector<HTMLElement>("[data-cabinet-state]")!;
    expect(chip.dataset.cabinetState).toBe("guest");
    expect(chip.textContent).toBe("GUEST MODE");
  });

  it("keeps the ticker out of assistive tech, which reads the screen instead", () => {
    const root = html(renderMarquee("Pawl", "anything"));
    expect(
      root.querySelector("[data-ticker-text]")!.closest("[aria-hidden='true']"),
    ).not.toBeNull();
  });

  it("leaves the page heading to the receipt when it crowns one", () => {
    const root = html(renderMarquee("Pawl", "t", false));
    expect(root.querySelector("h1")).toBeNull();
    expect(root.querySelector(".pw-marquee__brand")!.textContent).toBe("PAWL");
  });

  it("escapes the site name", () => {
    const root = html(renderMarquee("<b>x</b>", "t"));
    expect(root.querySelector("b")).toBeNull();
  });
});

describe("the serial plate", () => {
  it("links both receipts, prints the year and owner, and offers the sound switch", () => {
    const root = html(renderPlate("Pawl", "2026"));
    const links = [...root.querySelectorAll("a")].map((link) => [
      link.textContent,
      link.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["Privacy", "/privacy.html"],
      ["Terms", "/terms.html"],
    ]);
    expect(root.textContent).toContain("© 2026 Pawl");
    expect(root.textContent).toContain("PAWL-GW-01");
    const sound = root.querySelector<HTMLButtonElement>("[data-sound]")!;
    expect(sound.getAttribute("aria-pressed")).toBe("false");
  });

  it("points the receipts at another origin when the plate is drawn elsewhere", () => {
    const root = html(renderPlate("Pawl", "2026", "https://example.com"));
    expect(
      [...root.querySelectorAll("a")].map((link) => link.getAttribute("href")),
    ).toEqual([
      "https://example.com/privacy.html",
      "https://example.com/terms.html",
    ]);
  });
});
