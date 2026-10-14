import { describe, expect, it } from "vitest";

import type { MachineModel } from "../estate-adapter";
import { CATALOG } from "./catalog.testkit";
import {
  greeting,
  litKeys,
  machineAttributes,
  screenCopy,
  tileFor,
  viewFor,
} from "./copy";
import { initialState, reduce, type MachineState } from "./state";

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
  screen: "2 NEED ATTENTION",
  holder: "annisa",
  email: "annisa@example.test",
  indicators: { notes: { count: 7, severity: "warn" } },
  ticker: "2 NEED ATTENTION · NOTE 7",
};

const OWNED = [{ ...CATALOG[0]!, access: "owner" as const }, CATALOG[1]!];

function keys(state: MachineState, screen = "PICK A BAY", faulted = false) {
  return [...litKeys(state, screen, faulted)].sort();
}

function tile(state: MachineState, at: MachineModel, code: string) {
  return tileFor(
    state,
    at,
    state.catalog.find((bay) => bay.code === code)!,
  );
}

describe("the status line", () => {
  it("writes the screen as text, never as colour alone", () => {
    expect(screenCopy(initialState("guest", CATALOG), model)).toEqual({
      main: "PICK A BAY",
      sub: "OR SIGN IN ON SCREEN",
    });
    expect(screenCopy(initialState("owner", CATALOG), ownerModel)).toEqual({
      main: "2 NEED ATTENTION",
      sub: "SELECT A BAY",
    });
  });

  it("names a denial in words, with the bay and the reason", () => {
    expect(
      screenCopy(
        { ...initialState("guest", CATALOG), status: "denied", selection: "1" },
        model,
      ),
    ).toEqual({
      main: "1 DENIED, VISITOR PASS REQUIRED",
      sub: "SIGN IN TO UNLOCK",
    });
  });

  it("tells a visitor at an owner bay that signing in again will not help", () => {
    expect(
      screenCopy(
        { ...initialState("visitor", OWNED), status: "denied", selection: "1" },
        { ...ownerModel, access: "visitor" },
      ),
    ).toEqual({
      main: "1 DENIED, OWNER PASS REQUIRED",
      sub: "FOR THE OWNER ONLY",
    });
  });

  it("names the account screen and the way out to sign in", () => {
    expect(
      screenCopy(
        { ...initialState("owner", CATALOG), authStep: "account" },
        ownerModel,
      ),
    ).toEqual({ main: "YOUR ACCOUNT", sub: "MANAGE OR SIGN OUT" });
    expect(
      screenCopy(
        reduce(initialState("guest", CATALOG), { type: "sign-in" }),
        model,
      ),
    ).toEqual({ main: "OPENING SIGN-IN", sub: "ONE MOMENT" });
  });

  it("says signed in, not that a pass was accepted", () => {
    expect(
      screenCopy(
        { ...initialState("owner", CATALOG), status: "granted" },
        ownerModel,
      ).main,
    ).toBe("SIGNED IN");
  });

  it("offers a way back when the estate could not be read", () => {
    expect(
      screenCopy(initialState("owner", CATALOG), {
        ...ownerModel,
        screen: "ESTATE UNREADABLE",
      }),
    ).toEqual({ main: "ESTATE UNREADABLE", sub: "PRESS GO TO RETRY" });
  });

  it("follows a release through to the tray", () => {
    const releasing = reduce(initialState("owner", CATALOG), {
      type: "select",
      bay: "1",
    });
    expect(screenCopy(releasing, ownerModel).main).toBe("1 RELEASING, NOTE");
    expect(
      screenCopy(reduce(releasing, { type: "tray-ready" }), ownerModel),
    ).toEqual({
      main: "1 DELIVERED, NOTE",
      sub: "OPEN THE FLAP BELOW",
    });
  });
});

describe("the tiles", () => {
  it("lights only what policy permits", () => {
    expect(tile(initialState("guest", CATALOG), model, "3").lit).toBe(true);
    expect(tile(initialState("guest", CATALOG), model, "1").lit).toBe(false);
    expect(tile(initialState("owner", CATALOG), ownerModel, "1").lit).toBe(
      true,
    );
  });

  it("labels each cartridge for the person standing at the machine", () => {
    expect(tile(initialState("guest", CATALOG), model, "1").label).toBe(
      "Select Notes, bay 1, visitor pass required",
    );
    expect(tile(initialState("guest", CATALOG), model, "3").label).toBe(
      "Select Docs, bay 3, ready",
    );
    expect(tile(initialState("owner", CATALOG), ownerModel, "1").label).toBe(
      "Select Notes, bay 1, ready",
    );
  });

  it("never shows a guest a count, and tells a guest to sign in for a locked bay", () => {
    const guest = initialState("guest", CATALOG);
    expect(tile(guest, model, "1").badge).toEqual({
      text: "SIGN IN",
      severity: "locked",
    });
    expect(tile(guest, model, "3").badge).toEqual({
      text: "OPEN ↗",
      severity: "link",
    });
    expect(tile(guest, model, "1").locked).toBe("guest");
    expect(tile(guest, model, "3").locked).toBe("");
  });

  it("tells a visitor which bays need the owner's pass", () => {
    const visitor = initialState("visitor", OWNED);
    const at = { ...ownerModel, access: "visitor" as const };
    expect(tile(visitor, at, "1").badge).toEqual({
      text: "OWNER",
      severity: "locked",
    });
    expect(tile(visitor, at, "1").locked).toBe("owner");
  });

  it("shows a signed-in person their count, -- for a count it could not read, never 0", () => {
    const owner = initialState("owner", CATALOG);
    expect(tile(owner, ownerModel, "1").badge).toEqual({
      text: "7",
      severity: "warn",
    });
    expect(
      tile(
        owner,
        { ...ownerModel, indicators: { notes: { count: 3, severity: null } } },
        "1",
      ).badge,
    ).toEqual({ text: "3", severity: "ok" });
    expect(
      tile(owner, { ...ownerModel, indicators: { notes: "unknown" } }, "1")
        .badge,
    ).toEqual({
      text: "--",
      severity: "unknown",
    });
    expect(tile(owner, { ...ownerModel, indicators: {} }, "1").badge).toEqual({
      text: "--",
      severity: "unknown",
    });
    expect(
      tile(owner, { ...ownerModel, indicators: { notes: "locked" } }, "1")
        .badge,
    ).toEqual({
      text: "LOCKED",
      severity: "locked",
    });
  });

  it("rings the picked tile, then shows it releasing, then lets it rest; a refusal is denied", () => {
    const picked = reduce(initialState("owner", CATALOG), {
      type: "preselect",
      bay: "1",
    });
    expect([
      tile(picked, ownerModel, "1").state,
      tile(picked, ownerModel, "3").state,
    ]).toEqual(["selected", "idle"]);
    const releasing = reduce(picked, { type: "select", bay: "1" });
    expect(tile(releasing, ownerModel, "1").state).toBe("releasing");
    expect(
      tile(reduce(releasing, { type: "tray-ready" }), ownerModel, "1").state,
    ).toBe("idle");
    const refused = reduce(initialState("guest", CATALOG), {
      type: "select",
      bay: "1",
    });
    expect(tile(refused, model, "1").state).toBe("denied");
  });
});

describe("the machine's attributes and greeting", () => {
  it("is busy while a bay drops, while it leaves for sign-in, and while it bridges", () => {
    const owner = initialState("owner", CATALOG);
    expect(machineAttributes(owner)["data-busy"]).toBe("false");
    expect(
      machineAttributes(reduce(owner, { type: "select", bay: "1" }))[
        "data-busy"
      ],
    ).toBe("true");
    expect(
      machineAttributes(
        reduce(initialState("guest", CATALOG), { type: "sign-in" }),
      )["data-busy"],
    ).toBe("true");
  });

  it("greets a guest with the bays and a signed-in person by name and pass", () => {
    expect(greeting(initialState("guest", CATALOG), model)).toBe("PICK A BAY");
    expect(greeting(initialState("owner", CATALOG), ownerModel)).toBe(
      "HI, ANNISA · OWNER",
    );
  });
});

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

  it("goes dark while a bay is dropping and while it leaves for sign-in", () => {
    const dropping = reduce(initialState("owner", CATALOG), {
      type: "select",
      bay: "1",
    });
    expect(keys(dropping)).toEqual([]);
    expect(
      keys(reduce(initialState("guest", CATALOG), { type: "sign-in" })),
    ).toEqual([]);
  });

  it("lights only CLR on the account screen, because CLR is the way back", () => {
    expect(
      keys({ ...initialState("owner", CATALOG), authStep: "account" }),
    ).toEqual(["CLR"]);
  });

  it("shows the products by default, the account only when asked, and working while it leaves", () => {
    expect(viewFor(initialState("guest", CATALOG))).toBe("products");
    expect(
      viewFor({ ...initialState("owner", CATALOG), authStep: "account" }),
    ).toBe("account");
    expect(
      viewFor(reduce(initialState("guest", CATALOG), { type: "sign-in" })),
    ).toBe("working");
  });
});
