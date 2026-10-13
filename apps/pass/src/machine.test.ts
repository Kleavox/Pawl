import { describe, expect, it } from "vitest";
import { MACHINE_PARTS } from "@pawl/core";

import {
  SCREEN_FORM,
  initialMode,
  machineShell,
  paintMachine,
  type MachineParts,
} from "./machine";

const shell = machineShell("Pawl", "https://example.com");

function parts(): MachineParts & { access: { dataset: DOMStringMap } } {
  const node = () => ({ textContent: "" });
  return {
    access: { dataset: {} },
    machine: { dataset: {} } as HTMLElement,
    main: node(),
    sub: node(),
    word: node(),
    where: node(),
    chip: { dataset: {} } as HTMLElement,
    clr: { disabled: false } as HTMLButtonElement,
    go: { disabled: false } as HTMLButtonElement,
  } as never;
}

describe("the account page's machine", () => {
  it("is the shared machine with every part once, and no pass card", () => {
    for (const part of MACHINE_PARTS) {
      expect(shell.match(new RegExp(`data-part="${part}"`, "g"))).toHaveLength(
        1,
      );
    }
    expect(shell).not.toMatch(
      /pawl-card|data-reader|pocket|INSERT PASS|EJECT PASS|<header|<footer/,
    );
  });

  it("opens whole, so a direct visit can dolly in, and carries the #cam= targets for an arrival from the machine", () => {
    expect(shell).toContain('data-framing="whole"');
    expect(shell).toContain('id="cam=screen"');
  });

  it("gives the views a place on the display and a way back to the machine", () => {
    expect(shell).toMatch(/data-part="display"[\s\S]*id="screen"/);
    expect(shell).toContain('href="https://example.com/" data-to-machine');
  });

  it("makes GO submit the screen's form and CLR a plain button, with the digits unlit", () => {
    expect(shell).toMatch(
      new RegExp(
        `<button[^>]*type="submit"[^>]*form="${SCREEN_FORM}"[^>]*>GO</button>`,
      ),
    );
    expect(shell).toMatch(
      /<button[^>]*type="button"[^>]*data-key="CLR"[^>]*>CLR<\/button>/,
    );
    expect(shell).not.toMatch(/<button[^>]*>\d<\/button>/);
  });
});

describe("paintMachine", () => {
  it("writes the view's status on the LCD and lights GO only when there is a form", () => {
    const p = parts();
    paintMachine(
      p,
      { status: "SIGN IN", sub: "PASS REQUIRED", go: true },
      null,
    );
    expect([p.main.textContent, p.sub.textContent]).toEqual([
      "SIGN IN",
      "PASS REQUIRED",
    ]);
    expect(p.go.disabled).toBe(false);
    paintMachine(p, { status: "VERIFY EMAIL", go: false }, null);
    expect(p.go.disabled).toBe(true);
    expect(p.sub.textContent).toBe("");
  });

  it("darkens CLR when the view has nowhere to go back to", () => {
    const p = parts();
    paintMachine(p, { status: "SIGN IN", go: true }, null);
    expect(p.clr.disabled).toBe(true);
    paintMachine(
      p,
      { status: "CREATE ACCOUNT", go: true, back: () => undefined },
      null,
    );
    expect(p.clr.disabled).toBe(false);
  });

  it("shows the holder on the screen's top bar, the LCD and the mode chip", () => {
    const p = parts();
    paintMachine(
      p,
      { status: "ACCOUNT · PROFILE", go: false },
      { handle: "annisa", role: "ADMIN" },
    );
    expect(p.where.textContent).toBe("HI, ANNISA · OWNER");
    expect(p.sub.textContent).toBe("ANNISA · OWNER PASS");
    expect(p.word.textContent).toBe("OWNER MODE");
    expect(p.chip.dataset.cabinetState).toBe("owner");
    expect(p.machine.dataset.access).toBe("owner");
    paintMachine(p, { status: "SIGN IN", go: true }, null);
    expect(p.where.textContent).toBe("SIGN IN");
    expect(p.word.textContent).toBe("GUEST MODE");
    expect(p.machine.dataset.access).toBe("guest");
  });
});

describe("initialMode", () => {
  it("opens the register view when the cabinet asked for it", () => {
    expect(initialMode("?mode=register&returnTo=x")).toBe("register");
    expect(initialMode("?mode=forgot")).toBe("forgot");
    expect(initialMode("")).toBe("login");
    expect(initialMode("?mode=anything")).toBe("login");
  });
});
