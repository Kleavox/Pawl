import { afterEach, describe, expect, it, vi } from "vitest";

import { SoundSwitch } from "@pawl/ui";
import { fireEvent, render } from "@testing-library/react";
import { createElement, type ReactNode } from "react";

import { useSound } from "./sound";

const seen: { click: () => void; key: (label: string) => void } = {
  click: () => undefined,
  key: () => undefined,
};

function Probe(): ReactNode {
  const sound = useSound();
  seen.click = sound.click;
  seen.key = sound.key;
  return createElement(SoundSwitch, {
    pressed: sound.on,
    onToggle: sound.toggle,
  });
}

function plate(): HTMLElement {
  return render(createElement(Probe)).container;
}

function contexts(): { made: number; tones: number[][] } {
  const counter = { made: 0, tones: [] as number[][] };
  class FakeContext {
    currentTime = 0;
    destination = {};
    constructor() {
      counter.made += 1;
    }
    createOscillator() {
      const made: number[] = [];
      counter.tones.push(made);
      return {
        type: "",
        frequency: {
          set value(hz: number) {
            made.push(hz);
          },
        },
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

  it("plays a key's telephone tone pair, the keypad being the telephone layout", () => {
    const counter = contexts();
    const root = plate();
    fireEvent.click(root.querySelector<HTMLButtonElement>("[data-sound]")!);
    counter.tones.length = 0;
    seen.key("1");
    seen.key("5");
    seen.key("0");
    seen.key("CLR");
    seen.key("GO");
    expect(counter.tones).toEqual([
      [697],
      [1209],
      [770],
      [1336],
      [941],
      [1336],
      [941],
      [1209],
      [941],
      [1477],
    ]);
    counter.tones.length = 0;
    seen.click();
    expect(counter.tones).toEqual([[1800]]);
  });

  it("plays no tone while the sound is off", () => {
    const counter = contexts();
    plate();
    seen.key("1");
    expect(counter.made).toBe(0);
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
