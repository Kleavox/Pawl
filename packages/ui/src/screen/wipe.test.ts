import { afterEach, describe, expect, it, vi } from "vitest";

import { scanWipe, WIPE_MS } from "./wipe";

function screens(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `<div data-screen-views>
    <section data-view-panel="products"><button id="p">P</button><p data-say>said</p></section>
    <section data-view-panel="signin" hidden><label for="e">E</label><input id="e"></section>
    <section data-view-panel="email" hidden><p>email</p></section>
  </div>`;
  document.body.append(root);
  return root.querySelector<HTMLElement>("[data-screen-views]")!;
}

function reduceMotion(reduced: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({ matches: reduced && query.includes("reduce") }) as MediaQueryList,
  );
}

function swap(views: HTMLElement, from: string, to: string): HTMLElement {
  const previous = views.querySelector<HTMLElement>(
    `[data-view-panel='${from}']`,
  )!;
  previous.hidden = true;
  views.querySelector<HTMLElement>(`[data-view-panel='${to}']`)!.hidden = false;
  scanWipe(views, previous);
  return previous;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("scanWipe", () => {
  it("sweeps a scan line over the change, the old screen kept as an inert ghost until it passes", () => {
    reduceMotion(false);
    vi.useFakeTimers();
    const views = screens();
    swap(views, "products", "signin");
    expect(views.classList.contains("is-wiping")).toBe(true);
    const pane = views.querySelector<HTMLElement>(".screen__window")!;
    expect(pane.className).toContain("animate-[wipe-window_");
    const ghost = pane.querySelector<HTMLElement>(":scope > .screen__ghost")!;
    expect(ghost.className).toContain("animate-[wipe-ghost_");
    expect(ghost.className).toContain("bg-(image:--pw-lcd)!");
    expect(ghost.hasAttribute("inert")).toBe(true);
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    expect(ghost.hidden).toBe(false);
    expect(
      ghost.querySelector("[id], [data-view-panel], [data-say]"),
    ).toBeNull();
    expect(
      views.querySelectorAll("[data-view-panel]:not([hidden])"),
    ).toHaveLength(1);
    vi.advanceTimersByTime(WIPE_MS);
    expect(views.classList.contains("is-wiping")).toBe(false);
    expect(views.querySelector(".screen__window")).toBeNull();
  });

  it("scans a screen on from blank when there was none before it", () => {
    reduceMotion(false);
    vi.useFakeTimers();
    const views = screens();
    scanWipe(views, null);
    expect(views.classList.contains("is-wiping")).toBe(true);
    const blank = views.querySelector(".screen__window > .screen__ghost")!;
    expect(blank.childElementCount).toBe(0);
    vi.advanceTimersByTime(WIPE_MS);
    expect(views.classList.contains("is-wiping")).toBe(false);
  });

  it("swaps at once when motion is reduced", () => {
    reduceMotion(true);
    const views = screens();
    swap(views, "products", "signin");
    expect(views.classList.contains("is-wiping")).toBe(false);
    expect(views.querySelector(".screen__ghost")).toBeNull();
  });

  it("keeps one ghost when a second change lands mid sweep", () => {
    reduceMotion(false);
    vi.useFakeTimers();
    const views = screens();
    swap(views, "products", "signin");
    vi.advanceTimersByTime(WIPE_MS / 2);
    swap(views, "signin", "email");
    expect(views.querySelectorAll(".screen__ghost")).toHaveLength(1);
    vi.advanceTimersByTime(WIPE_MS / 2);
    expect(views.classList.contains("is-wiping")).toBe(true);
    vi.advanceTimersByTime(WIPE_MS / 2);
    expect(views.querySelector(".screen__ghost")).toBeNull();
  });
});
