import { afterEach, describe, expect, it, vi } from "vitest";
import { litKeys, render, say } from "./render";
import { initialState, reduce } from "./state";
import type { MachineState } from "./state";
import { CATALOG } from "./catalog.testkit";
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
    <div data-machine data-access="guest" data-status="idle" data-input="selector" data-view="idle">
      <span data-cabinet-state="guest"><span data-cabinet-word>GUEST MODE</span></span>
      <span data-ticker-text></span>
      <section class="cabinet">
        <div data-bay="1"><button data-cartridge="1"></button><i data-backlight></i><span data-rail><span data-led data-severity="none">—</span></span></div>
        <div data-bay="3"><button data-cartridge="3"></button><i data-backlight></i><span data-rail><span data-led data-severity="link">OPEN ↗</span></span></div>
        <span data-falling="none"><strong data-falling-name></strong></span>
        <div data-tray="none">
          <strong data-tray-code></strong><small data-tray-name></small>
        </div>
      </section>
      <section aria-label="Service panel">
        <div role="status" aria-live="polite" aria-atomic="true">
          <p data-screen></p><span data-screen-sub></span>
        </div>
        <section data-view-panel="idle"><button data-terminal-open></button><p data-say></p></section>
        <section data-view-panel="signed-in" hidden><span data-account-name></span><span data-account-role></span><p data-say></p></section>
        <section data-view-panel="signin" data-terminal hidden><p data-say></p></section>
        <section data-view-panel="code" hidden>
          <span data-code-cell></span><span data-code-cell></span><span data-code-cell></span>
          <span data-code-cell></span><span data-code-cell></span><span data-code-cell></span>
          <p data-say></p>
        </section>
        <section data-view-panel="working" hidden><p data-say></p></section>
        <div>${["1", "2", "3", "4", "5", "6", "7", "8", "9", "CLR", "0", "GO"]
          .map((key) => `<button data-key="${key}">${key}</button>`)
          .join("")}</div>
        <button data-reader></button>
        <div class="pawl-card"><span data-card-holder></span><span data-card-role></span></div>
      </section>
    </div>
    <dialog data-transfer="none"><strong data-transfer-name></strong><button data-transfer-cancel></button></dialog>`;
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
  holder: null,
  indicators: null,
  ticker: "WELCOME TO PAWL · PICK A BAY · SIGN IN FOR MORE",
};

const ownerModel: MachineModel = {
  access: "owner",
  items: [
    { code: "1", lit: true },
    { code: "3", lit: true },
  ],
  screen: "2 NEED ATTENTION",
  holder: "annisa",
  indicators: { notes: { count: 7, severity: "warn" } },
  ticker: "2 NEED ATTENTION · NOTE 7",
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
    ...initialState("guest", CATALOG),
    authStep: "otp-machine",
    busy: true,
    authDigits: digits,
  };
}

describe("render", () => {
  it("lights only what policy permits", () => {
    const element = root();
    render(element, initialState("guest", CATALOG), model);
    expect(attr(element, "[data-bay='3'] [data-backlight]", "data-lit")).toBe(
      "true",
    );
    expect(attr(element, "[data-bay='1'] [data-backlight]", "data-lit")).toBe(
      "false",
    );

    render(element, initialState("owner", CATALOG), ownerModel);
    expect(attr(element, "[data-bay='1'] [data-backlight]", "data-lit")).toBe(
      "true",
    );
    expect(attr(element, "[data-bay='3'] [data-backlight]", "data-lit")).toBe(
      "true",
    );
  });

  it("writes the screen as text, never as colour alone", () => {
    const element = root();
    render(element, initialState("guest", CATALOG), model);
    expect(main(element)).toBe("INSERT PASS");

    render(element, initialState("owner", CATALOG), ownerModel);
    expect(main(element)).toBe("2 NEED ATTENTION");
  });

  it("names a denial in words, with the bay and the reason", () => {
    const element = root();
    render(
      element,
      { ...initialState("guest", CATALOG), status: "denied", selection: "1" },
      model,
    );
    expect(main(element)).toBe("1 DENIED, VISITOR PASS REQUIRED");
  });

  it("labels each cartridge for the person standing at the machine, not for a fixed role", () => {
    const element = root();
    render(element, initialState("guest", CATALOG), model);
    expect(attr(element, "[data-cartridge='1']", "aria-label")).toBe(
      "Select Notes, bay 1, visitor pass required",
    );
    expect(attr(element, "[data-cartridge='3']", "aria-label")).toBe(
      "Select Docs, bay 3, ready",
    );

    render(element, initialState("owner", CATALOG), ownerModel);
    expect(attr(element, "[data-cartridge='1']", "aria-label")).toBe(
      "Select Notes, bay 1, ready",
    );
  });

  it("offers a way back when the estate could not be read", () => {
    const element = root();
    render(element, initialState("owner", CATALOG), {
      ...ownerModel,
      screen: "ESTATE UNREADABLE",
    });
    expect(main(element)).toBe("ESTATE UNREADABLE");
    expect(sub(element)).toBe("PRESS GO TO RETRY");

    render(element, initialState("owner", CATALOG), ownerModel);
    expect(main(element)).toBe("2 NEED ATTENTION");
    expect(sub(element)).toBe("SELECT A BAY");
  });

  it("counts the email code out of the reducer's buffer", () => {
    const element = root();
    for (const digits of ["", "4", "48", "486", "4861", "48619", "486192"]) {
      render(element, otpAt(digits), model);
      expect(main(element)).toBe(`EMAIL CODE ${digits.length}/6`);
    }
    render(element, initialState("guest", CATALOG), model);
    expect(main(element)).toBe("INSERT PASS");
  });

  it("changes the screen words when the keypad changes mode", () => {
    const element = root();
    render(element, initialState("guest", CATALOG), model);
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
    render(element, initialState("guest", CATALOG), model);
    expect(attr(element, "[data-machine]", "data-input")).toBe("selector");

    render(element, otpAt("123"), model);
    expect(attr(element, "[data-machine]", "data-input")).toBe("otp");

    for (const step of ["closed", "methods", "oauth", "issuing"] as const) {
      render(
        element,
        { ...initialState("guest", CATALOG), authStep: step },
        model,
      );
      expect(attr(element, "[data-machine]", "data-input")).toBe("selector");
    }
  });

  it("tells the truth about who is standing at the machine", () => {
    const element = root();
    render(element, initialState("owner", CATALOG), ownerModel);
    expect(attr(element, "[data-machine]", "data-access")).toBe("owner");
    expect(attr(element, "[data-cabinet-state]", "data-cabinet-state")).toBe(
      "owner",
    );
    expect(element.querySelector("[data-cabinet-state]")?.textContent).toBe(
      "OWNER MODE",
    );
    expect(element.querySelector("[data-card-holder]")?.textContent).toBe(
      "annisa",
    );
    expect(element.querySelector("[data-card-role]")?.textContent).toBe(
      "OWNER PASS",
    );

    render(element, initialState("guest", CATALOG), model);
    expect(attr(element, "[data-cabinet-state]", "data-cabinet-state")).toBe(
      "guest",
    );
    expect(element.querySelector("[data-cabinet-state]")?.textContent).toBe(
      "GUEST MODE",
    );
    expect(element.querySelector("[data-card-holder]")?.textContent).toBe("");
  });

  it("moves the cartridge, the tray and the bridge with the state", () => {
    const element = root();
    const releasing = reduce(initialState("owner", CATALOG), {
      type: "select",
      bay: "1",
    });
    render(element, releasing, ownerModel);
    expect(attr(element, "[data-machine]", "data-status")).toBe("dispensing");
    expect(attr(element, "[data-falling]", "data-falling")).toBe("1");
    expect(element.querySelector("[data-falling-name]")?.textContent).toBe(
      "NOTE",
    );

    const delivered = reduce(releasing, { type: "tray-ready" });
    render(element, delivered, ownerModel);
    expect(attr(element, "[data-falling]", "data-falling")).toBe("none");
    expect(attr(element, "[data-tray]", "data-tray")).toBe("1");
    expect(element.querySelector("[data-tray-name]")?.textContent).toBe("NOTE");

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
      reduce(initialState("owner", CATALOG), { type: "select", bay: "1" }),
      { type: "tray-ready" },
    );
    render(first, state, ownerModel);
    render(second, initialState("guest", CATALOG), model);
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
    return reduce(
      reduce(initialState("owner", CATALOG), { type: "select", bay: "1" }),
      {
        type: "tray-ready",
      },
    );
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
    render(element, initialState("guest", CATALOG), model);
    render(element, initialState("guest", CATALOG), model);
    expect(closed).not.toHaveBeenCalled();
  });
});

function view(element: HTMLElement): string {
  return element.querySelector<HTMLElement>("[data-machine]")!.dataset.view!;
}

function shown(element: HTMLElement): string[] {
  return [
    ...element.querySelectorAll<HTMLElement>("[data-view-panel]:not([hidden])"),
  ].map((panel) => panel.dataset.viewPanel!);
}

function led(element: HTMLElement, bay: string): [string, string] {
  const node = element.querySelector<HTMLElement>(
    `[data-bay='${bay}'] [data-led]`,
  )!;
  return [node.textContent ?? "", node.dataset.severity ?? ""];
}

describe("the touchscreen shows one view at a time", () => {
  it("picks the view from the machine's state, and hides every other one", () => {
    const element = root();
    const steps: [MachineState, MachineModel, string][] = [
      [initialState("guest", CATALOG), model, "idle"],
      [initialState("owner", CATALOG), ownerModel, "signed-in"],
      [
        { ...initialState("guest", CATALOG), authStep: "methods" },
        model,
        "signin",
      ],
      [otpAt("12"), model, "code"],
      [
        { ...initialState("guest", CATALOG), authStep: "oauth" },
        model,
        "working",
      ],
      [
        { ...initialState("guest", CATALOG), authStep: "issuing" },
        model,
        "working",
      ],
    ];
    for (const [state, at, expected] of steps) {
      render(element, state, at);
      expect(view(element)).toBe(expected);
      expect(shown(element)).toEqual([expected]);
    }
  });

  it("writes the pass holder where the signed-in view names them", () => {
    const element = root();
    render(element, initialState("owner", CATALOG), ownerModel);
    expect(element.querySelector("[data-account-name]")?.textContent).toBe(
      "annisa",
    );
    expect(element.querySelector("[data-account-role]")?.textContent).toBe(
      "Owner pass: every bay is open to you.",
    );
  });

  it("fills one code cell per digit the keypad has taken", () => {
    const element = root();
    render(element, otpAt("481"), model);
    const cells = [
      ...element.querySelectorAll<HTMLElement>("[data-code-cell]"),
    ];
    expect(cells.map((cell) => cell.textContent)).toEqual([
      "4",
      "8",
      "1",
      "",
      "",
      "",
    ]);
    expect(cells.map((cell) => cell.dataset.filled)).toEqual([
      "true",
      "true",
      "true",
      "false",
      "false",
      "false",
    ]);
  });
});

describe("the label rails", () => {
  it("never shows a guest a count, and tells a guest which bays need a pass", () => {
    const element = root();
    render(element, initialState("guest", CATALOG), model);
    expect(led(element, "1")).toEqual(["PASS", "locked"]);
    expect(led(element, "3")).toEqual(["OPEN ↗", "link"]);
  });

  it("shows a signed-in person their count, with the severity the app reported", () => {
    const element = root();
    render(element, initialState("owner", CATALOG), ownerModel);
    expect(led(element, "1")).toEqual(["7", "warn"]);
    render(element, initialState("owner", CATALOG), {
      ...ownerModel,
      indicators: { notes: { count: 3, severity: null } },
    });
    expect(led(element, "1")).toEqual(["3", "ok"]);
  });

  it("prints -- for a count it could not read, never 0", () => {
    const element = root();
    render(element, initialState("owner", CATALOG), {
      ...ownerModel,
      indicators: { notes: "unknown" },
    });
    expect(led(element, "1")).toEqual(["--", "unknown"]);
    render(element, initialState("owner", CATALOG), {
      ...ownerModel,
      indicators: {},
    });
    expect(led(element, "1")).toEqual(["--", "unknown"]);
  });

  it("calls a bay the app itself locked a locked bay", () => {
    const element = root();
    render(element, initialState("owner", CATALOG), {
      ...ownerModel,
      indicators: { notes: "locked" },
    });
    expect(led(element, "1")).toEqual(["PASS", "locked"]);
  });
});

describe("the chosen bay", () => {
  it("marks only the bay the keypad picked, while it is picked or releasing", () => {
    const element = root();
    const bay = (code: string): string =>
      element.querySelector<HTMLElement>(`[data-bay='${code}']`)!.dataset
        .selected!;
    const picked = reduce(initialState("owner", CATALOG), {
      type: "preselect",
      bay: "1",
    });
    render(element, picked, ownerModel);
    expect([bay("1"), bay("3")]).toEqual(["true", "false"]);
    const releasing = reduce(picked, { type: "select", bay: "1" });
    render(element, releasing, ownerModel);
    expect(bay("1")).toBe("true");
    render(element, reduce(releasing, { type: "tray-ready" }), ownerModel);
    expect(bay("1")).toBe("false");
  });
});

describe("the ticker", () => {
  it("carries the words the model computed", () => {
    const element = root();
    render(element, initialState("owner", CATALOG), ownerModel);
    expect(element.querySelector("[data-ticker-text]")?.textContent).toBe(
      "2 NEED ATTENTION · NOTE 7",
    );
  });
});

describe("the cartridge's shape follows the catalog", () => {
  it("drops, delivers and bridges a wide cartridge as wide", () => {
    const element = root();
    const dispensing = reduce(initialState("guest", CATALOG), {
      type: "select",
      bay: "3",
    });
    render(element, dispensing, model);
    expect(attr(element, "[data-falling]", "data-falling-shape")).toBe("wide");
    expect(element.querySelector("[data-falling-name]")?.textContent).toBe(
      "MANUAL",
    );

    const delivered = reduce(dispensing, { type: "tray-ready" });
    render(element, delivered, model);
    expect(attr(element, "[data-tray]", "data-tray-shape")).toBe("wide");

    const bridging = reduce(delivered, { type: "activate-tray" });
    render(element, bridging, model);
    expect(attr(element, "[data-transfer]", "data-transfer-shape")).toBe(
      "wide",
    );
  });
});

function signingIn(): MachineState {
  const guest = initialState("guest", CATALOG);
  const reading = reduce(guest, { type: "pass-tap" });
  return reduce(reading, { type: "reader-scanned" });
}

function typing(digits: string): MachineState {
  const sent = reduce(signingIn(), { type: "otp-sent" });
  return reduce(sent, { type: "otp-digits", digits });
}

const AT_REST = "INSERT PASS";

function keys(state: MachineState, screen = AT_REST, faulted = false) {
  return [...litKeys(state, screen, faulted)].sort();
}

describe("a key is lit only when it does something on this screen", () => {
  it("lights the bays that hold an app, and nothing that has nothing to do", () => {
    expect(keys(initialState("guest", CATALOG))).toEqual(["1", "3"]);
  });

  it("lights CLR and GO once a bay is picked, so it can be taken or put back", () => {
    const picked = reduce(initialState("owner", CATALOG), {
      type: "preselect",
      bay: "1",
    });
    expect(keys(picked)).toEqual(["1", "3", "CLR", "GO"]);
  });

  it("lights CLR on a refusal, so the person can put it back", () => {
    const refused = reduce(initialState("guest", CATALOG), {
      type: "select",
      bay: "1",
    });
    expect(keys(refused)).toContain("CLR");
  });

  it("lights GO when the estate could not be read, because GO retries", () => {
    expect(keys(initialState("owner", CATALOG), "ESTATE UNREADABLE")).toContain(
      "GO",
    );
  });

  it("lights CLR while a fault holds the screen, because CLR clears it", () => {
    expect(
      keys(initialState("guest", CATALOG), "RELEASE FAILED, TRY AGAIN", true),
    ).toContain("CLR");
  });

  it("goes dark while a bay is dropping", () => {
    const dropping = reduce(initialState("owner", CATALOG), {
      type: "select",
      bay: "1",
    });
    expect(keys(dropping)).toEqual([]);
  });

  it("offers only GO and CLR on the sign-in view: send the code, or go back", () => {
    expect(keys(signingIn())).toEqual(["CLR", "GO"]);
  });

  it("lights the digits for a code until it is whole, then GO", () => {
    expect(keys(typing("12"))).toEqual(
      ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "CLR"].sort(),
    );
    expect(keys(typing("123456"))).toEqual(["CLR", "GO"]);
  });

  it("goes dark while the pass is being checked", () => {
    const issuing = reduce(typing("123456"), { type: "verifying" });
    expect(keys(issuing)).toEqual([]);
  });

  it("marks an unlit key aria-disabled, so it is announced as unavailable without dropping focus", () => {
    const element = root();
    render(element, initialState("guest", CATALOG), model);
    const disabled = [
      ...element.querySelectorAll<HTMLButtonElement>("[data-key]"),
    ]
      .filter((key) => key.getAttribute("aria-disabled") === "true")
      .map((key) => key.dataset.key);
    expect(disabled).toEqual([
      "2",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "CLR",
      "0",
      "GO",
    ]);
  });
});

describe("the machine says what went wrong where the person is looking", () => {
  it("writes into the view on show and clears the hidden ones", () => {
    const element = root();
    say(element, signingIn(), "first");
    const issuing = reduce(typing("123456"), { type: "verifying" });
    say(element, issuing, "Pick the bay again.");
    expect(
      element.querySelector("[data-view-panel='working'] [data-say]")!
        .textContent,
    ).toBe("Pick the bay again.");
    expect(
      element.querySelector("[data-view-panel='signin'] [data-say]")!
        .textContent,
    ).toBe("");
  });
});
