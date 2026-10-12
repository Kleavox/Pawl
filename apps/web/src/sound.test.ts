import { afterEach, describe, expect, it, vi } from "vitest";

import { mountSound } from "./sound";

function plate(): HTMLElement {
  const root = document.createElement("div");
  const button = document.createElement("button");
  button.dataset.sound = "";
  button.setAttribute("aria-pressed", "false");
  root.append(button);
  document.body.append(root);
  return root;
}

function contexts(): { made: number } {
  const counter = { made: 0 };
  class FakeContext {
    currentTime = 0;
    destination = {};
    constructor() {
      counter.made += 1;
    }
    createOscillator() {
      return {
        type: "",
        frequency: { value: 0 },
        connect: (node: unknown) => node,
        start: () => undefined,
        stop: () => undefined,
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: () => undefined,
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: (node: unknown) => node,
      };
    }
  }
  vi.stubGlobal("AudioContext", FakeContext);
  return counter;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
});

describe("the sound switch", () => {
  it("starts off, and a key press makes no sound", () => {
    const counter = contexts();
    const root = plate();
    const sound = mountSound(root);
    expect(
      root.querySelector("[data-sound]")!.getAttribute("aria-pressed"),
    ).toBe("false");
    sound.click();
    expect(counter.made).toBe(0);
  });

  it("turns on, remembers it, and then clicks", () => {
    const counter = contexts();
    const root = plate();
    const sound = mountSound(root);
    root.querySelector<HTMLButtonElement>("[data-sound]")!.click();
    expect(
      root.querySelector("[data-sound]")!.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(localStorage.getItem("pawl:sound")).toBe("on");
    sound.click();
    expect(counter.made).toBe(1);
  });

  it("comes back on when the browser remembered it", () => {
    localStorage.setItem("pawl:sound", "on");
    const root = plate();
    mountSound(root);
    expect(
      root.querySelector("[data-sound]")!.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("stays off, and still switches, when storage refuses", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const root = plate();
    mountSound(root);
    const button = root.querySelector<HTMLButtonElement>("[data-sound]")!;
    expect(button.getAttribute("aria-pressed")).toBe("false");
    button.click();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    vi.restoreAllMocks();
  });
});
