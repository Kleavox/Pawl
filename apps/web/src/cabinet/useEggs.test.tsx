import { act, fireEvent, render } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KONAMI, LUCKY_HOLD_MS, ROCK_HOLD_MS, ROCK_MS, ROLL_MS } from "./eggs";
import { LuckyCredit, useEggs } from "./useEggs";

type Scene = {
  tray: string | null;
  denied: boolean;
  paperOut: boolean;
  random: () => number;
};

function Harness(props: Scene): ReactNode {
  const machine = useRef<HTMLDivElement>(null);
  const eggs = useEggs({ machine, paperOut: props.paperOut });
  return (
    <div
      ref={machine}
      data-machine
      data-rocking={eggs.rocking ? "" : undefined}
    >
      <span data-steel>steel</span>
      <button type="button">key</button>
      <div data-part="display">
        <span data-glass>glass</span>
      </div>
      <div data-part="keypad">
        <span data-pad>pad</span>
      </div>
      <input data-field />
      <p data-notice>
        {eggs.notice === null
          ? ""
          : `${eggs.notice.main ?? ""}|${eggs.notice.sub}`}
      </p>
      <LuckyCredit
        tray={props.tray}
        denied={props.denied}
        paperOut={props.paperOut}
        override={eggs.credit}
        random={props.random}
        onLucky={eggs.lucky}
      />
    </div>
  );
}

const IDLE: Scene = {
  tray: null,
  denied: false,
  paperOut: false,
  random: () => 0.5,
};

function scene(start: Partial<Scene> = {}) {
  const view = render(<Harness {...IDLE} {...start} />);
  const credit = () =>
    view.container.querySelector<HTMLElement>("[data-part='credit']")!;
  return {
    ...view,
    credit,
    text: () => credit().dataset.credit,
    notice: () =>
      view.container.querySelector("[data-notice]")!.textContent ?? "",
    machine: () => view.container.querySelector<HTMLElement>("[data-machine]")!,
    to: (next: Partial<Scene>) =>
      view.rerender(<Harness {...IDLE} {...start} {...next} />),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the lucky number", () => {
  it("rolls when a cartridge lands and stops on a number that is not four of a kind", () => {
    const seen = scene();
    expect(seen.text()).toBe("FrEE");
    seen.to({ tray: "7" });
    act(() => void vi.advanceTimersByTime(ROLL_MS - 1));
    expect(seen.text()).toBe("5555");
    act(() => void vi.advanceTimersByTime(1));
    expect(seen.text()).toBe("5556");
    expect(seen.credit()).not.toHaveAttribute("data-credit-blink");
    expect(seen.notice()).toBe("");
  });

  it("wins with 7777, blinks, says so, then says no more", () => {
    const seen = scene({ random: () => 0 });
    seen.to({ tray: "7" });
    act(() => void vi.advanceTimersByTime(ROLL_MS));
    expect(seen.text()).toBe("7777");
    expect(seen.credit()).toHaveAttribute("data-credit-blink");
    expect(seen.notice()).toBe("|LUCKY 7777, ONE MORE ON US");
    act(() => void vi.advanceTimersByTime(LUCKY_HOLD_MS));
    expect(seen.notice()).toBe("");
  });

  it("stops at FrEE when the cartridge is taken mid-roll, and never wins late", () => {
    const seen = scene({ random: () => 0 });
    seen.to({ tray: "7" });
    act(() => void vi.advanceTimersByTime(ROLL_MS / 2));
    seen.to({ tray: null });
    expect(seen.text()).toBe("FrEE");
    act(() => void vi.advanceTimersByTime(ROLL_MS));
    expect(seen.text()).toBe("FrEE");
    expect(seen.notice()).toBe("");
  });

  it("stops at FrEE when a paper comes out mid-roll", () => {
    const seen = scene({ random: () => 0 });
    seen.to({ tray: "7" });
    act(() => void vi.advanceTimersByTime(ROLL_MS / 2));
    seen.to({ tray: "7", paperOut: true });
    expect(seen.text()).toBe("FrEE");
    act(() => void vi.advanceTimersByTime(ROLL_MS));
    expect(seen.notice()).toBe("");
  });

  it("reads ---- while a bay is denied", () => {
    const seen = scene({ denied: true });
    expect(seen.text()).toBe("----");
  });

  it("reads ---- for a denied pick even after a roll has settled", () => {
    const seen = scene();
    seen.to({ tray: "7" });
    act(() => void vi.advanceTimersByTime(ROLL_MS));
    expect(seen.text()).toBe("5556");
    seen.to({ tray: "7", denied: true });
    expect(seen.text()).toBe("----");
  });

  it("rolls each landing once, even after a paper comes and goes", () => {
    let calls = 0;
    const random = () => {
      calls += 1;
      return 0.5;
    };
    const seen = scene({ random });
    seen.to({ tray: "7", random });
    act(() => void vi.advanceTimersByTime(ROLL_MS));
    const settled = calls;
    seen.to({ tray: "7", paperOut: true, random });
    seen.to({ tray: "7", paperOut: false, random });
    act(() => void vi.advanceTimersByTime(ROLL_MS * 2));
    expect(calls).toBe(settled);
    expect(seen.text()).toBe("FrEE");
  });

  it("drops a win line when a paper comes out, so it never comes back after", () => {
    const seen = scene({ random: () => 0 });
    seen.to({ tray: "7" });
    act(() => void vi.advanceTimersByTime(ROLL_MS));
    expect(seen.notice()).toBe("|LUCKY 7777, ONE MORE ON US");
    seen.to({ tray: "7", paperOut: true });
    seen.to({ tray: "7", paperOut: false });
    expect(seen.notice()).toBe("");
  });
});

describe("rocking the machine", () => {
  it("rocks once and warns after five taps on the steel within two seconds", () => {
    const seen = scene();
    const steel = seen.container.querySelector("[data-steel]")!;
    for (let tap = 0; tap < 5; tap += 1) fireEvent.click(steel);
    expect(seen.machine()).toHaveAttribute("data-rocking");
    expect(seen.notice()).toBe("NEVER ROCK OR TILT|IT IS FREE ANYWAY");
    act(() => void vi.advanceTimersByTime(ROCK_MS));
    expect(seen.machine()).not.toHaveAttribute("data-rocking");
    act(() => void vi.advanceTimersByTime(ROCK_HOLD_MS - ROCK_MS));
    expect(seen.notice()).toBe("");
  });

  it("forgives taps spread over more than two seconds", () => {
    const seen = scene();
    const steel = seen.container.querySelector("[data-steel]")!;
    for (let tap = 0; tap < 4; tap += 1) fireEvent.click(steel);
    act(() => void vi.advanceTimersByTime(2100));
    fireEvent.click(steel);
    expect(seen.machine()).not.toHaveAttribute("data-rocking");
  });

  it("does not count a key, the glass or a control", () => {
    const seen = scene();
    for (const selector of ["button", "[data-glass]", "[data-pad]"]) {
      const target = seen.container.querySelector(selector)!;
      for (let tap = 0; tap < 5; tap += 1) fireEvent.click(target);
    }
    expect(seen.machine()).not.toHaveAttribute("data-rocking");
  });
});

describe("the Konami code", () => {
  function press(target: EventTarget, key: string): boolean {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it("adds thirty lives on the credit display and the LCD, and takes no key from the page", () => {
    const seen = scene();
    let prevented = false;
    for (const key of KONAMI) {
      act(() => {
        prevented ||= press(document.body, key);
      });
    }
    expect(prevented).toBe(false);
    expect(seen.text()).toBe("  30");
    expect(seen.notice()).toBe("+30 LIVES|NOT THAT YOU NEED THEM");
    act(() => void vi.advanceTimersByTime(3000));
    expect(seen.text()).toBe("FrEE");
    expect(seen.notice()).toBe("");
  });

  it("is not heard while typing in a field", () => {
    const seen = scene();
    const field = seen.container.querySelector("[data-field]")!;
    for (const key of KONAMI) act(() => void press(field, key));
    expect(seen.text()).toBe("FrEE");
  });

  it("does nothing while a paper is in hand", () => {
    const seen = scene({ paperOut: true });
    for (const key of KONAMI) act(() => void press(document.body, key));
    expect(seen.notice()).toBe("");
    expect(seen.text()).toBe("FrEE");
  });
});
