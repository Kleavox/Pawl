import { afterEach, describe, expect, it, vi } from "vitest";

import { renderScreens } from "./screens";
import { scanWipe, WIPE_MS } from "./wipe";

const INPUT = {
  siteName: "Fixture & Co",
  passHref: "https://paw.example.test",
  passSignIn: "https://paw.example.test/?returnTo=https%3A%2F%2Fexample.test",
  passHost: "paw.example.test",
  tiles: `<div class="tiles"></div>`,
};

function screens(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = renderScreens(INPUT);
  document.body.append(root);
  return root;
}

function reduceMotion(reduced: boolean): void {
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("renderScreens", () => {
  it("draws six screens and shows only the products", () => {
    const root = screens();
    const panels = [
      ...root.querySelectorAll<HTMLElement>("[data-view-panel]"),
    ].map((panel) => panel.dataset.viewPanel);
    expect(panels).toEqual([
      "products",
      "signin",
      "email",
      "code",
      "working",
      "account",
    ]);
    const shown = root.querySelectorAll("[data-view-panel]:not([hidden])");
    expect(shown).toHaveLength(1);
    expect((shown[0] as HTMLElement).dataset.viewPanel).toBe("products");
  });

  it("gives every screen a top bar, a foot and one line to speak in", () => {
    for (const panel of screens().querySelectorAll("[data-view-panel]")) {
      expect(panel.querySelector(".view__bar")).not.toBeNull();
      expect(panel.querySelector(".view__foot")).not.toBeNull();
      expect(panel.querySelectorAll("[data-say]")).toHaveLength(1);
    }
  });

  it("numbers the three ways to sign in and binds them to the keypad", () => {
    const signin = screens().querySelector("[data-view-panel='signin']")!;
    const ways = [...signin.querySelectorAll<HTMLButtonElement>(".choice")];
    expect(ways.map((way) => way.getAttribute("aria-keyshortcuts"))).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(
      ways.map((way) => way.querySelector(".choice__label")!.textContent),
    ).toEqual([
      "Continue with Google",
      "Continue with GitHub",
      "Email me a code",
    ]);
    for (const way of ways) {
      expect(way.querySelector("kbd")!.getAttribute("aria-hidden")).toBe(
        "true",
      );
    }
    expect(signin.querySelector("h2")!.textContent).toBe(
      "Sign in to Fixture & Co",
    );
    const password = signin.querySelector<HTMLAnchorElement>(".view__note a")!;
    expect(password.href).toBe(INPUT.passSignIn);
    expect(password.textContent).toBe("Sign in on paw.example.test");
    expect(password.parentElement!.textContent).toBe(
      "Password? Sign in on paw.example.test",
    );
    expect(password.parentElement!.classList).toContain("view__note--line");
  });

  it("says on the sign-in's top bar which product sent the guest there", () => {
    const signin = screens().querySelector("[data-view-panel='signin']")!;
    expect(
      signin.querySelector(".view__bar [data-sign-in-for]"),
    ).not.toBeNull();
    expect(signin.querySelector(".view__body [data-sign-in-for]")).toBeNull();
  });

  it("offers the account's way out to paw. and a sign out", () => {
    const account = screens().querySelector("[data-view-panel='account']")!;
    const manage = account.querySelector<HTMLAnchorElement>(
      "a[data-account-manage]",
    )!;
    expect(manage.href).toBe(`${INPUT.passHref}/`);
    expect(manage.textContent).toContain("Manage account");
    expect(account.querySelector("button[data-logout]")!.textContent).toBe(
      "Sign out",
    );
    expect(account.querySelector("[data-step-back]")).not.toBeNull();
    expect(account.querySelector("[data-account-email]")).not.toBeNull();
  });

  it("puts both bar controls on the products, the account one hidden until someone signs in", () => {
    const products = screens().querySelector("[data-view-panel='products']")!;
    expect(
      products.querySelector("[data-terminal-open]")!.hasAttribute("hidden"),
    ).toBe(false);
    expect(
      products.querySelector("[data-account-open]")!.hasAttribute("hidden"),
    ).toBe(true);
  });

  it("escapes the site's name", () => {
    const root = document.createElement("div");
    root.innerHTML = renderScreens({ ...INPUT, siteName: "<img src=x>" });
    expect(root.querySelector("img")).toBeNull();
  });
});

describe("scanWipe", () => {
  function swap(root: HTMLElement): HTMLElement {
    const views = root.querySelector<HTMLElement>("[data-screen-views]")!;
    const products = views.querySelector<HTMLElement>(
      "[data-view-panel='products']",
    )!;
    products.hidden = true;
    views.querySelector<HTMLElement>("[data-view-panel='signin']")!.hidden =
      false;
    scanWipe(views, products);
    return views;
  }

  it("sweeps a scan line over the change, the old screen kept as an inert ghost until it passes", () => {
    reduceMotion(false);
    vi.useFakeTimers();
    const views = swap(screens());
    expect(views.classList.contains("is-wiping")).toBe(true);
    const ghost = views.querySelector<HTMLElement>(".screen__ghost")!;
    expect(ghost.hasAttribute("inert")).toBe(true);
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    expect(
      ghost.querySelector("[id], [data-view-panel], [data-say]"),
    ).toBeNull();
    expect(
      views.querySelectorAll("[data-view-panel]:not([hidden])"),
    ).toHaveLength(1);
    vi.advanceTimersByTime(WIPE_MS);
    expect(views.classList.contains("is-wiping")).toBe(false);
    expect(views.querySelector(".screen__ghost")).toBeNull();
  });

  it("scans a screen on from blank when there was none before it", () => {
    reduceMotion(false);
    vi.useFakeTimers();
    const views = screens().querySelector<HTMLElement>("[data-screen-views]")!;
    scanWipe(views, null);
    expect(views.classList.contains("is-wiping")).toBe(true);
    expect(views.querySelector(".screen__ghost")).toBeNull();
    vi.advanceTimersByTime(WIPE_MS);
    expect(views.classList.contains("is-wiping")).toBe(false);
  });

  it("swaps at once when motion is reduced", () => {
    reduceMotion(true);
    const views = swap(screens());
    expect(views.classList.contains("is-wiping")).toBe(false);
    expect(views.querySelector(".screen__ghost")).toBeNull();
  });

  it("keeps one ghost when a second change lands mid sweep", () => {
    reduceMotion(false);
    vi.useFakeTimers();
    const root = screens();
    const views = swap(root);
    vi.advanceTimersByTime(WIPE_MS / 2);
    const signin = views.querySelector<HTMLElement>(
      "[data-view-panel='signin']",
    )!;
    signin.hidden = true;
    views.querySelector<HTMLElement>("[data-view-panel='email']")!.hidden =
      false;
    scanWipe(views, signin);
    expect(views.querySelectorAll(".screen__ghost")).toHaveLength(1);
    vi.advanceTimersByTime(WIPE_MS / 2);
    expect(views.classList.contains("is-wiping")).toBe(true);
    vi.advanceTimersByTime(WIPE_MS / 2);
    expect(views.querySelector(".screen__ghost")).toBeNull();
  });
});
