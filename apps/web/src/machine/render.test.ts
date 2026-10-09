import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "./render";
import { initialState, reduce } from "./state";
import type { MachineState } from "./state";
import type { MachineModel } from "../estate-adapter";

if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal(
    this: HTMLDialogElement,
  ): void {
    if (this.open)
      throw new Error("showModal on a dialog that is already open");
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.show = function show(
    this: HTMLDialogElement,
  ): void {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(
    this: HTMLDialogElement,
  ): void {
    this.removeAttribute("open");
  };
}

function root(): HTMLElement {
  const element = document.createElement("div");
  element.innerHTML = `
    <div data-machine data-access="guest" data-status="idle" data-input="selector">
      <section class="cabinet">
        <span data-cabinet-state="guest">GUEST MODE</span>
        <div data-bay="1"><button data-cartridge="1"></button><i data-backlight></i></div>
        <div data-bay="3"><button data-cartridge="3"></button><i data-backlight></i></div>
        <span data-falling="none"><strong data-falling-name></strong></span>
        <div data-tray="none">
          <strong data-tray-code></strong><small data-tray-name></small>
        </div>
      </section>
      <button data-dock aria-expanded="false">
        <span data-dock-screen></span><small data-dock-sub></small>
      </button>
      <button data-scrim aria-hidden="true"></button>
      <aside data-console="closed">
        <button data-console-close></button>
        <div role="status" aria-live="polite" aria-atomic="true">
          <p data-screen></p><span data-screen-sub></span>
        </div>
        <button data-reader></button>
        <span data-terminal-state></span>
      </aside>
    </div>
    <dialog data-transfer="none"><strong data-transfer-name></strong><button data-transfer-cancel></button></dialog>
    <dialog data-terminal><dd data-terminal-access></dd></dialog>`;
  document.body.append(element);
  return element;
}

afterEach(() => {
  for (const open of document.querySelectorAll("dialog[open]")) {
    (open as HTMLDialogElement).close();
  }
  document.body.replaceChildren();
});

const model: MachineModel = {
  access: "guest",
  items: [
    { code: "1", lit: false },
    { code: "3", lit: true },
  ],
  screen: "INSERT PASS",
};

const ownerModel: MachineModel = {
  access: "owner",
  items: [
    { code: "1", lit: true },
    { code: "3", lit: true },
  ],
  screen: "2 NEED ATTENTION",
};

function attr(element: HTMLElement, selector: string, name: string): string {
  return element.querySelector(selector)?.getAttribute(name) ?? "";
}

function main(element: HTMLElement): string {
  return element.querySelector("[data-screen]")?.textContent ?? "";
}

function sub(element: HTMLElement): string {
  return element.querySelector("[data-screen-sub]")?.textContent ?? "";
}

function otpAt(digits: string): MachineState {
  return {
    ...initialState("guest"),
    authStep: "otp-machine",
    busy: true,
    authDigits: digits,
  };
}

describe("render", () => {
  it("lights only what policy permits", () => {
    const element = root();
    render(element, initialState("guest"), model);
    expect(attr(element, "[data-bay='3'] [data-backlight]", "data-lit")).toBe(
      "true",
    );
    expect(attr(element, "[data-bay='1'] [data-backlight]", "data-lit")).toBe(
      "false",
    );

    render(element, initialState("owner"), ownerModel);
    expect(attr(element, "[data-bay='1'] [data-backlight]", "data-lit")).toBe(
      "true",
    );
    expect(attr(element, "[data-bay='3'] [data-backlight]", "data-lit")).toBe(
      "true",
    );
  });

  it("writes the screen as text, never as colour alone", () => {
    const element = root();
    render(element, initialState("guest"), model);
    expect(main(element)).toBe("INSERT PASS");

    render(element, initialState("owner"), ownerModel);
    expect(main(element)).toBe("2 NEED ATTENTION");
  });

  it("names a denial in words, with the bay and the reason", () => {
    const element = root();
    render(
      element,
      { ...initialState("guest"), status: "denied", selection: "1" },
      model,
    );
    expect(main(element)).toBe("1 DENIED, VISITOR PASS REQUIRED");
  });

  it("labels each cartridge for the person standing at the machine, not for a fixed role", () => {
    const element = root();
    render(element, initialState("guest"), model);
    expect(attr(element, "[data-cartridge='1']", "aria-label")).toBe(
      "Select Link, bay 1, visitor pass required",
    );
    expect(attr(element, "[data-cartridge='3']", "aria-label")).toBe(
      "Select Portfolio, bay 3, ready",
    );

    render(element, initialState("owner"), ownerModel);
    expect(attr(element, "[data-cartridge='1']", "aria-label")).toBe(
      "Select Link, bay 1, ready",
    );
  });

  it("offers a way back when the estate could not be read", () => {
    const element = root();
    render(element, initialState("owner"), {
      ...ownerModel,
      screen: "ESTATE UNREADABLE",
    });
    expect(main(element)).toBe("ESTATE UNREADABLE");
    expect(sub(element)).toBe("PRESS GO TO RETRY");

    render(element, initialState("owner"), ownerModel);
    expect(main(element)).toBe("2 NEED ATTENTION");
    expect(sub(element)).toBe("SELECT A BAY");
  });

  it("counts the email code out of the reducer's buffer", () => {
    const element = root();
    for (const digits of ["", "4", "48", "486", "4861", "48619", "486192"]) {
      render(element, otpAt(digits), model);
      expect(main(element)).toBe(`EMAIL CODE ${digits.length}/6`);
    }
    render(element, initialState("guest"), model);
    expect(main(element)).toBe("INSERT PASS");
  });

  it("changes the screen words when the keypad changes mode", () => {
    const element = root();
    render(element, initialState("guest"), model);
    const selecting = { main: main(element), sub: sub(element) };
    render(element, otpAt(""), model);
    const entering = { main: main(element), sub: sub(element) };

    expect(entering.main).not.toBe(selecting.main);
    expect(entering.sub).not.toBe(selecting.sub);
    expect(entering.main).toContain("EMAIL CODE");
    expect(entering.main.length).toBeGreaterThan(0);
    expect(selecting.main.length).toBeGreaterThan(0);
  });

  it("says a rejected code is rejected and how many tries are left", () => {
    const element = root();
    render(element, { ...otpAt(""), authAttemptsLeft: 2 }, model);
    expect(main(element)).toBe("CODE REJECTED");
    expect(sub(element)).toBe("2 TRIES LEFT");

    render(element, { ...otpAt(""), authAttemptsLeft: 1 }, model);
    expect(sub(element)).toBe("1 TRY LEFT");

    render(element, { ...otpAt("48"), authAttemptsLeft: 2 }, model);
    expect(main(element)).toBe("EMAIL CODE 2/6");
  });

  it("projects the keypad mode from authStep and nothing else", () => {
    const element = root();
    render(element, initialState("guest"), model);
    expect(attr(element, "[data-machine]", "data-input")).toBe("selector");

    render(element, otpAt("123"), model);
    expect(attr(element, "[data-machine]", "data-input")).toBe("otp");

    for (const step of ["closed", "methods", "oauth", "issuing"] as const) {
      render(element, { ...initialState("guest"), authStep: step }, model);
      expect(attr(element, "[data-machine]", "data-input")).toBe("selector");
    }
  });

  it("tells the truth about who is standing at the machine", () => {
    const element = root();
    render(element, initialState("owner"), ownerModel);
    expect(attr(element, "[data-machine]", "data-access")).toBe("owner");
    expect(attr(element, "[data-cabinet-state]", "data-cabinet-state")).toBe(
      "owner",
    );
    expect(element.querySelector("[data-cabinet-state]")?.textContent).toBe(
      "OWNER MODE",
    );
    expect(element.querySelector("[data-terminal-access]")?.textContent).toBe(
      "OWNER",
    );

    render(element, initialState("guest"), model);
    expect(attr(element, "[data-cabinet-state]", "data-cabinet-state")).toBe(
      "guest",
    );
    expect(element.querySelector("[data-cabinet-state]")?.textContent).toBe(
      "GUEST MODE",
    );
    expect(element.querySelector("[data-terminal-access]")?.textContent).toBe(
      "NONE",
    );
  });

  it("moves the cartridge, the tray and the bridge with the state", () => {
    const element = root();
    const releasing = reduce(initialState("owner"), {
      type: "select",
      bay: "1",
    });
    render(element, releasing, ownerModel);
    expect(attr(element, "[data-machine]", "data-status")).toBe("dispensing");
    expect(attr(element, "[data-falling]", "data-falling")).toBe("1");
    expect(element.querySelector("[data-falling-name]")?.textContent).toBe(
      "LINK",
    );

    const delivered = reduce(releasing, { type: "tray-ready" });
    render(element, delivered, ownerModel);
    expect(attr(element, "[data-falling]", "data-falling")).toBe("none");
    expect(attr(element, "[data-tray]", "data-tray")).toBe("1");
    expect(element.querySelector("[data-tray-name]")?.textContent).toBe("LINK");

    const bridging = reduce(delivered, { type: "activate-tray" });
    render(element, bridging, ownerModel);
    expect(attr(element, "[data-transfer]", "data-transfer")).toBe("1");

    render(element, reduce(bridging, { type: "cancel" }), ownerModel);
    expect(attr(element, "[data-transfer]", "data-transfer")).toBe("none");
    expect(attr(element, "[data-tray]", "data-tray")).toBe("1");
  });

  it("is a projection: the same state paints the same DOM", () => {
    const first = root();
    const second = root();
    const state = reduce(
      reduce(initialState("owner"), { type: "select", bay: "1" }),
      { type: "tray-ready" },
    );
    render(first, state, ownerModel);
    render(second, initialState("guest"), model);
    render(second, otpAt("12"), model);
    render(second, state, ownerModel);
    expect(second.innerHTML).toBe(first.innerHTML);

    const once = first.innerHTML;
    render(first, state, ownerModel);
    expect(first.innerHTML).toBe(once);
  });
});

describe("render owns the bridge", () => {
  function delivered(): MachineState {
    return reduce(reduce(initialState("owner"), { type: "select", bay: "1" }), {
      type: "tray-ready",
    });
  }

  it("opens the bridge with showModal, never as an ordinary panel", () => {
    const element = root();
    const bridge = element.querySelector<HTMLDialogElement>("[data-transfer]")!;
    const modal = vi.spyOn(bridge, "showModal");
    const plain = vi.spyOn(bridge, "show");

    const resting = delivered();
    render(element, resting, ownerModel);
    expect(bridge.open).toBe(false);
    expect(modal).not.toHaveBeenCalled();

    render(element, reduce(resting, { type: "activate-tray" }), ownerModel);
    expect(bridge.open).toBe(true);
    expect(modal).toHaveBeenCalledTimes(1);
    expect(plain).not.toHaveBeenCalled();
  });

  it("closes the bridge when the transfer is cancelled", () => {
    const element = root();
    const bridge = element.querySelector<HTMLDialogElement>("[data-transfer]")!;
    const bridging = reduce(delivered(), { type: "activate-tray" });
    render(element, bridging, ownerModel);
    expect(bridge.open).toBe(true);

    render(element, reduce(bridging, { type: "cancel" }), ownerModel);
    expect(bridge.open).toBe(false);
    expect(bridge.getAttribute("data-transfer")).toBe("none");
  });

  it("does not open a bridge that is already open", () => {
    const element = root();
    const bridge = element.querySelector<HTMLDialogElement>("[data-transfer]")!;
    const modal = vi.spyOn(bridge, "showModal");
    const bridging = reduce(delivered(), { type: "activate-tray" });
    render(element, bridging, ownerModel);
    render(element, bridging, ownerModel);
    expect(modal).toHaveBeenCalledTimes(1);
    expect(bridge.open).toBe(true);
  });

  it("does not close a bridge that was never open", () => {
    const element = root();
    const bridge = element.querySelector<HTMLDialogElement>("[data-transfer]")!;
    const closed = vi.spyOn(bridge, "close");
    render(element, initialState("guest"), model);
    render(element, initialState("guest"), model);
    expect(closed).not.toHaveBeenCalled();
  });
});

describe("render owns the console", () => {
  const sheetOpen: MachineState = {
    ...initialState("guest"),
    consoleLayout: "sheet",
    consoleOpen: true,
  };

  it("projects the sheet's open state onto every attribute that carries it", () => {
    const element = root();
    render(element, initialState("guest"), model);
    expect(attr(element, "[data-console]", "data-console")).toBe("closed");
    expect(attr(element, "[data-dock]", "aria-expanded")).toBe("false");
    expect(attr(element, "[data-console]", "aria-hidden")).toBe("true");
    expect(element.querySelector("[data-console]")?.hasAttribute("inert")).toBe(
      true,
    );

    render(element, sheetOpen, model);
    expect(attr(element, "[data-console]", "data-console")).toBe("open");
    expect(attr(element, "[data-dock]", "aria-expanded")).toBe("true");
    expect(attr(element, "[data-console]", "aria-hidden")).toBe("false");
    expect(element.querySelector("[data-console]")?.hasAttribute("inert")).toBe(
      false,
    );
  });

  it("makes the open sheet a modal and seals everything outside it", () => {
    const element = root();
    render(element, sheetOpen, model);
    expect(attr(element, "[data-console]", "role")).toBe("dialog");
    expect(attr(element, "[data-console]", "aria-modal")).toBe("true");
    expect(element.querySelector(".cabinet")?.hasAttribute("inert")).toBe(true);
    expect(element.querySelector("[data-dock]")?.hasAttribute("inert")).toBe(
      true,
    );
    expect(
      element.querySelector("[data-transfer]")?.hasAttribute("inert"),
    ).toBe(false);
    expect(element.querySelector("[data-scrim]")?.hasAttribute("inert")).toBe(
      false,
    );
    expect(
      element.querySelector("[data-terminal]")?.hasAttribute("inert"),
    ).toBe(false);

    render(element, initialState("guest"), model);
    expect(element.querySelector(".cabinet")?.hasAttribute("inert")).toBe(
      false,
    );
    expect(element.querySelector("[data-dock]")?.hasAttribute("inert")).toBe(
      false,
    );
  });

  it("is a landmark, not a modal, once the console is a column", () => {
    const element = root();
    const column: MachineState = {
      ...initialState("guest"),
      consoleLayout: "column",
    };
    render(element, sheetOpen, model);
    expect(attr(element, "[data-console]", "role")).toBe("dialog");
    render(element, column, model);
    expect(attr(element, "[data-console]", "data-console")).toBe("open");
    expect(element.querySelector("[data-console]")?.hasAttribute("role")).toBe(
      false,
    );
    expect(
      element.querySelector("[data-console]")?.hasAttribute("aria-modal"),
    ).toBe(false);
    expect(element.querySelector("[data-console]")?.hasAttribute("inert")).toBe(
      false,
    );
    expect(element.querySelector(".cabinet")?.hasAttribute("inert")).toBe(
      false,
    );
  });

  it("keeps a column open even when the sheet was left closed", () => {
    const element = root();
    render(
      element,
      { ...initialState("guest"), consoleLayout: "column", consoleOpen: false },
      model,
    );
    expect(attr(element, "[data-console]", "data-console")).toBe("open");
    expect(attr(element, "[data-dock]", "aria-expanded")).toBe("true");
  });
});
