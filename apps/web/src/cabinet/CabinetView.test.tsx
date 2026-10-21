import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MachineModel } from "../estate-adapter";
import { CATALOG } from "../machine/catalog.testkit";
import { initialState, reduce, type MachineState } from "../machine/state";
import { CabinetView, type CabinetViewProps } from "./CabinetView";
import type { Delivered } from "./DeliveryReceipt";

const model: MachineModel = {
  access: "guest",
  items: [
    { code: "1", lit: false },
    { code: "3", lit: true },
  ],
  screen: "PICK A BAY",
  holder: null,
  email: null,
  indicators: null,
  ticker: "WELCOME TO PAWL · PICK A BAY · SIGN IN FOR MORE",
};

const ownerModel: MachineModel = {
  access: "owner",
  items: [
    { code: "1", lit: true },
    { code: "3", lit: true },
  ],
  screen: "2 NEED YOU",
  holder: "annisa",
  email: "annisa@example.test",
  indicators: { notes: { count: 7, severity: "warn" } },
  ticker: "2 NEED YOU · NOTE 7",
};

function props(
  state: MachineState,
  at: MachineModel,
  extra: Partial<CabinetViewProps> = {},
): CabinetViewProps {
  return {
    siteName: "Pawl",
    passHref: "https://paw.example.test",
    state,
    model: at,
    fault: null,
    said: "",
    lcd: null,
    leaving: null,
    sound: { on: false, toggle: vi.fn() },
    delivery: null,
    copied: null,
    on: {
      key: vi.fn(),
      tile: vi.fn(),
      signIn: vi.fn(),
      account: vi.fn(),
      back: vi.fn(),
      manage: vi.fn(),
      logout: vi.fn(),
      take: vi.fn(),
      paper: {
        open: vi.fn(),
        stay: vi.fn(),
        copy: vi.fn(),
        retry: vi.fn(),
        leave: vi.fn(),
        crumple: vi.fn(),
      },
    },
    ...extra,
  };
}

const PRINTED: Delivered = {
  printKey: 1,
  facts: {
    bay: "3",
    item: "MANUAL",
    place: { word: "To", host: "docs.example.test" },
    pass: "VISITOR PASS",
    holder: "annisa",
    printed: new Date(2026, 9, 19, 14, 3),
  },
  body: {
    kind: "link",
    title: "Docs",
    href: "https://docs.example.test/",
    left: 10,
  },
};

describe("a receipt in hand", () => {
  it("keeps the products on the screen and the delivery on the paper, with every key dark", () => {
    const state = { ...initialState("visitor", CATALOG), receipt: "3" };
    const root = drawn(state, model, { delivery: PRINTED });
    const visible = [...root.querySelectorAll("[data-view-panel]")]
      .filter((panel) => !(panel as HTMLElement).hidden)
      .map((panel) => panel.getAttribute("data-view-panel"));
    expect(visible).toEqual(["products"]);
    expect(root.querySelector("[data-view-panel='receipt']")).toBeNull();
    expect(root.querySelector("[data-view-panel='products']")).toHaveAttribute(
      "inert",
    );
    expect(text(root, "[data-screen]")).toBe("RECEIPT PRINTED");
    expect(text(root, "[data-screen-sub]")).toBe("03 MANUAL");
    expect(root.querySelector("dialog[data-delivery]")).toHaveAttribute("open");
    expect(text(root, "[data-receipt] h1")).toBe("Docs");
    expect(
      [...root.querySelectorAll<HTMLElement>("[data-key]")].every(
        (key) => key.getAttribute("aria-disabled") === "true",
      ),
    ).toBe(true);
  });

  it("says what went wrong on the products behind the paper", () => {
    const state = { ...initialState("visitor", CATALOG), receipt: "3" };
    const root = drawn(state, model, {
      delivery: PRINTED,
      said: "This browser cannot hold your bay request.",
    });
    expect(text(root, "[data-view-panel='products'] [data-say]")).toBe(
      "This browser cannot hold your bay request.",
    );
  });

  it("keeps the dialog closed and empty while nothing is printed", () => {
    const root = drawn(initialState("visitor", CATALOG), model);
    expect(
      root.querySelector("[data-view-panel='products']"),
    ).not.toHaveAttribute("inert");
    expect(root.querySelector("dialog[data-delivery]")).not.toHaveAttribute(
      "open",
    );
    expect(root.querySelector("[data-receipt-sheet]")).toBeNull();
  });
});

function drawn(
  state: MachineState,
  at: MachineModel,
  extra: Partial<CabinetViewProps> = {},
): HTMLElement {
  return render(<CabinetView {...props(state, at, extra)} />).container;
}

function text(root: HTMLElement, selector: string): string {
  return root.querySelector(selector)?.textContent ?? "";
}

function attr(root: HTMLElement, selector: string, name: string): string {
  return root.querySelector(selector)?.getAttribute(name) ?? "";
}

describe("CabinetView", () => {
  it("writes the status line and the ticker the model computed", () => {
    const root = drawn(initialState("owner", CATALOG), ownerModel);
    expect(text(root, "[data-screen]")).toBe("2 NEED YOU");
    expect(text(root, "[data-screen-sub]")).toBe("PICK A BAY");
    expect(text(root, "[data-ticker-text]")).toBe("2 NEED YOU · NOTE 7");
  });

  it("holds a fault on the status line and lights CLR to clear it", () => {
    const root = drawn(initialState("guest", CATALOG), model, {
      fault: { main: "RELEASE FAILED", sub: "TRY AGAIN" },
    });
    expect(text(root, "[data-screen]")).toBe("RELEASE FAILED");
    expect(text(root, "[data-screen-sub]")).toBe("TRY AGAIN");
    expect(attr(root, "[data-key='CLR']", "aria-disabled")).toBe("false");
  });

  it("tells the truth about who is standing at the machine", () => {
    const root = drawn(initialState("owner", CATALOG), ownerModel);
    expect(attr(root, "[data-machine]", "data-access")).toBe("owner");
    expect(attr(root, "[data-cabinet-state]", "data-cabinet-state")).toBe(
      "owner",
    );
    expect(text(root, "[data-cabinet-state]")).toBe("OWNER MODE");
    expect(text(root, "[data-account-name]")).toBe("annisa");
    expect(text(root, "[data-account-email]")).toBe("annisa@example.test");
    expect(text(root, "[data-account-pass]")).toBe("OWNER PASS");
    expect(text(root, "[data-account-role]")).toBe(
      "Owner pass: every bay is open to you.",
    );
    const guest = drawn(initialState("guest", CATALOG), model);
    expect(text(guest, "[data-cabinet-state]")).toBe("GUEST MODE");
    expect(text(guest, "[data-account-name]")).toBe("");
  });

  it("asks a guest to pick a bay and offers the sign-in, not the account", () => {
    const root = drawn(initialState("guest", CATALOG), model);
    expect(text(root, "[data-greeting]")).toBe("PICK A BAY");
    expect(root.querySelector("[data-sign-in]")).not.toHaveAttribute("hidden");
    expect(root.querySelector("[data-account-open]")).toHaveAttribute("hidden");
  });

  it("greets a signed-in person by name and pass, and offers the account", () => {
    const root = drawn(initialState("owner", CATALOG), ownerModel);
    expect(text(root, "[data-greeting]")).toBe("HI, ANNISA · OWNER");
    expect(root.querySelector("[data-sign-in]")).toHaveAttribute("hidden");
    expect(root.querySelector("[data-account-open]")).not.toHaveAttribute(
      "hidden",
    );
  });

  it("shows exactly one view, picked from the machine's state", () => {
    const steps: [MachineState, MachineModel, string][] = [
      [initialState("guest", CATALOG), model, "products"],
      [initialState("owner", CATALOG), ownerModel, "products"],
      [
        { ...initialState("owner", CATALOG), authStep: "account" },
        ownerModel,
        "account",
      ],
      [
        reduce(initialState("guest", CATALOG), { type: "sign-in" }),
        model,
        "working",
      ],
      [
        { ...initialState("visitor", CATALOG), receipt: "3" },
        model,
        "products",
      ],
    ];
    for (const [state, at, expected] of steps) {
      const root = drawn(state, at);
      expect(attr(root, "[data-machine]", "data-view")).toBe(expected);
      expect(
        [
          ...root.querySelectorAll<HTMLElement>(
            "[data-view-panel]:not([hidden])",
          ),
        ].map((panel) => panel.dataset.viewPanel),
      ).toEqual([expected]);
    }
  });

  it("paints each tile from the state: lit, locked, labelled and badged", () => {
    const root = drawn(initialState("guest", CATALOG), model);
    expect(attr(root, "[data-tile='3']", "data-lit")).toBe("true");
    expect(attr(root, "[data-tile='1']", "data-lit")).toBe("false");
    expect(attr(root, "[data-tile='1']", "data-locked")).toBe("guest");
    expect(attr(root, "[data-cartridge='1']", "aria-label")).toBe(
      "Select Notes, bay 1, visitor pass required",
    );
    expect(text(root, "[data-tile='1'] [data-badge]")).toBe("SIGN IN");
    expect(attr(root, "[data-tile='1'] [data-badge]", "data-severity")).toBe(
      "locked",
    );
    expect(root.querySelectorAll("[data-tile]")).toHaveLength(9);
  });

  it("rings the picked tile, then shows it releasing and the machine busy", () => {
    const picked = reduce(initialState("owner", CATALOG), {
      type: "preselect",
      bay: "1",
    });
    expect(
      attr(drawn(picked, ownerModel), "[data-tile='1']", "data-state"),
    ).toBe("selected");
    const releasing = reduce(picked, { type: "select", bay: "1" });
    const root = drawn(releasing, ownerModel);
    expect(attr(root, "[data-tile='1']", "data-state")).toBe("releasing");
    expect(attr(root, "[data-machine]", "data-busy")).toBe("true");
  });

  it("moves the cartridge, the tray and the receipt with the state, with the catalog's shape", () => {
    const dropping = reduce(initialState("guest", CATALOG), {
      type: "select",
      bay: "3",
    });
    let root = drawn(dropping, model);
    expect(attr(root, "[data-falling]", "data-falling")).toBe("3");
    expect(attr(root, "[data-falling]", "data-falling-shape")).toBe("wide");
    expect(text(root, "[data-falling-name]")).toBe("MANUAL");
    const delivered = reduce(dropping, { type: "tray-ready" });
    root = drawn(delivered, model);
    expect(attr(root, "[data-falling]", "data-falling")).toBe("none");
    expect(attr(root, "[data-tray]", "data-tray")).toBe("3");
    expect(attr(root, "[data-tray]", "data-tray-shape")).toBe("wide");
    expect(text(root, "[data-tray-name]")).toBe("MANUAL");
    const out = reduce(delivered, { type: "take" });
    root = drawn(out, model, { delivery: PRINTED });
    expect(attr(root, "[data-tray]", "data-tray")).toBe("none");
    expect(root.querySelector("dialog[data-delivery]")).toHaveAttribute("open");
  });

  it("marks an unlit key aria-disabled, so it is announced as unavailable", () => {
    const root = drawn(initialState("guest", CATALOG), model);
    expect(
      [...root.querySelectorAll<HTMLElement>("[data-key]")]
        .filter((key) => key.getAttribute("aria-disabled") === "true")
        .map((key) => key.dataset.key),
    ).toEqual(["2", "4", "5", "6", "7", "8", "9", "CLR", "0", "GO"]);
  });

  it("says what went wrong in the view that is showing, and nowhere else", () => {
    const root = drawn(
      { ...initialState("owner", CATALOG), authStep: "account" },
      ownerModel,
      { said: "Sign-out failed." },
    );
    expect(text(root, "[data-view-panel='account'] [data-say]")).toBe(
      "Sign-out failed.",
    );
    expect(text(root, "[data-view-panel='products'] [data-say]")).toBe("");
  });

  it("names the departure on the status line while it leaves", () => {
    const root = drawn(initialState("guest", CATALOG), model, {
      lcd: { main: "PRINTING RECEIPT", sub: "ONE MOMENT" },
    });
    expect(text(root, "[data-screen]")).toBe("PRINTING RECEIPT");
    expect(text(root, "[data-screen-sub]")).toBe("ONE MOMENT");
  });

  it("carries no sign-in screens of its own and no pass card", () => {
    const root = drawn(initialState("guest", CATALOG), model);
    expect(
      root.querySelector(
        "[data-view-panel='signin'], [data-view-panel='email'], [data-view-panel='code'], [data-terminal]",
      ),
    ).toBeNull();
    expect(root.innerHTML).not.toMatch(
      /pawl-card|data-reader|INSERT PASS|EJECT PASS/,
    );
  });
});

describe("the eggs on the cabinet", () => {
  it("lays a notice over the LCD, a whole one or only its second line", () => {
    const state = initialState("guest", CATALOG);
    const whole = drawn(state, model, {
      notice: { main: "+30 LIVES", sub: "NOBODY LOSES HERE" },
    });
    expect(whole.querySelector("[data-screen]")).toHaveTextContent("+30 LIVES");
    expect(whole.querySelector("[data-screen-sub]")).toHaveTextContent(
      "NOBODY LOSES HERE",
    );
    const line = drawn(state, model, {
      notice: { sub: "ONE MORE ON US" },
    });
    expect(line.querySelector("[data-screen]")).toHaveTextContent("PICK A BAY");
    expect(line.querySelector("[data-screen-sub]")).toHaveTextContent(
      "ONE MORE ON US",
    );
  });

  it("lets a leaving message win over a notice", () => {
    const root = drawn(initialState("guest", CATALOG), model, {
      lcd: { main: "OPENING ACCOUNT", sub: "ONE MOMENT" },
      notice: { main: "+30 LIVES", sub: "NOBODY LOSES HERE" },
    });
    expect(root.querySelector("[data-screen]")).toHaveTextContent(
      "OPENING ACCOUNT",
    );
  });

  it("rocks the machine and shows the credit it is given", () => {
    const root = drawn(initialState("guest", CATALOG), model, {
      rocking: true,
      credit: <span data-part="credit" data-credit="1234" />,
    });
    expect(root.querySelector("[data-machine]")).toHaveAttribute(
      "data-rocking",
    );
    expect(root.querySelector("[data-part='credit']")).toHaveAttribute(
      "data-credit",
      "1234",
    );
    expect(
      drawn(initialState("guest", CATALOG), model).querySelector(
        "[data-machine]",
      ),
    ).not.toHaveAttribute("data-rocking");
  });
});
