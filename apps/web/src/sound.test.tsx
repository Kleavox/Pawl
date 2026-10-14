import { afterEach, describe, expect, it, vi } from "vitest";

import { SoundSwitch } from "@pawl/ui";
import { fireEvent, render } from "@testing-library/react";
import { createElement, type ReactNode } from "react";

import { useSound } from "./sound";

const seen: { click: () => void } = { click: () => undefined };

function Probe(): ReactNode {
  const sound = useSound();
  seen.click = sound.click;
  return createElement(SoundSwitch, {
    pressed: sound.on,
    onToggle: sound.toggle,
  });
}

function plate(): HTMLElement {
  return render(createElement(Probe)).container;
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
});

describe("the sound switch", () => {
  it("starts off, and a key press makes no sound", () => {
    const counter = contexts();
    const root = plate();
    expect(
      root.querySelector("[data-sound]")!.getAttribute("aria-pressed"),
    ).toBe("false");
    seen.click();
    expect(counter.made).toBe(0);
  });

  it("turns on, remembers it, and then clicks", () => {
    const counter = contexts();
    const root = plate();
    fireEvent.click(root.querySelector<HTMLButtonElement>("[data-sound]")!);
    expect(
      root.querySelector("[data-sound]")!.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(localStorage.getItem("pawl:sound")).toBe("on");
    seen.click();
    expect(counter.made).toBe(1);
  });

  it("comes back on when the browser remembered it", () => {
    localStorage.setItem("pawl:sound", "on");
    const root = plate();
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
    const button = root.querySelector<HTMLButtonElement>("[data-sound]")!;
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    vi.restoreAllMocks();
  });
});
