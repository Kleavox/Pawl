import { describe, expect, it } from "vitest";

import { CATALOG } from "./machine/catalog.testkit";
import { toMachineModel } from "./estate-adapter";

const KEYS = ["pass", "notes"];

const ADMIN = { authenticated: true, identity: { role: "ADMIN" } };
const USER = { authenticated: true, identity: { role: "USER" } };

function estate(
  tools: Record<string, unknown>,
  attention: unknown[] = [],
  role = "ADMIN",
): never {
  return { role, tools, attention } as never;
}

const READ = {
  pass: { count: 1, severity: null },
  notes: { count: 0, severity: null },
};

describe("machine model", () => {
  it("asks a signed out visitor to pick a bay and lights only the public bay", () => {
    const model = toMachineModel({ authenticated: false }, null, CATALOG, KEYS);
    expect(model.access).toBe("guest");
    expect(model.screen).toBe("PICK A BAY");
    expect(
      model.items.filter((item) => item.lit).map((item) => item.code),
    ).toEqual(["3"]);
  });

  it("counts what needs attention on the screen", () => {
    const model = toMachineModel(
      ADMIN,
      estate(READ, [{ kind: "a" }, { kind: "b" }]),
      CATALOG,
      KEYS,
    );
    expect(model.screen).toBe("2 NEED YOU");
  });

  it("says nothing needs you when the estate is clear and fully known", () => {
    expect(toMachineModel(ADMIN, estate(READ), CATALOG, KEYS).screen).toBe(
      "NOTHING NEEDS YOU",
    );
  });

  it("calls a locked tool read, not unknown", () => {
    const locked = { ...READ, notes: "locked" };
    expect(toMachineModel(ADMIN, estate(locked), CATALOG, KEYS).screen).toBe(
      "NOTHING NEEDS YOU",
    );
  });

  it("says the estate is unreadable rather than showing a calm machine", () => {
    expect(toMachineModel(ADMIN, null, CATALOG, KEYS).screen).toBe(
      "ESTATE UNREADABLE",
    );
  });

  it("does not call an estate of all-silent blocks a readable one", () => {
    const silent = estate({ pass: null, notes: null });
    expect(toMachineModel(ADMIN, silent, CATALOG, KEYS).screen).toBe(
      "ESTATE UNREADABLE",
    );
  });
});

describe("bay lighting follows the catalog, not a second table", () => {
  it("lights every bay for an owner", () => {
    const model = toMachineModel(ADMIN, null, CATALOG, KEYS);
    expect(model.items.map((item) => item.code)).toEqual(["1", "3"]);
    expect(
      model.items.filter((item) => item.lit).map((item) => item.code),
    ).toEqual(["1", "3"]);
  });

  it("lights the visitor and public bays for a visitor", () => {
    const model = toMachineModel(USER, null, CATALOG, KEYS);
    expect(
      model.items.filter((item) => item.lit).map((item) => item.code),
    ).toEqual(["1", "3"]);
  });
});

describe("a partially unreadable estate is never mistaken for a quiet one", () => {
  it("does not say nothing needs you when a tool could not be read", () => {
    const partial = estate({ ...READ, pass: null });
    expect(toMachineModel(ADMIN, partial, CATALOG, KEYS).screen).toBe(
      "ESTATE UNREADABLE",
    );
  });

  it("calls a tool the estate never mentioned unread", () => {
    const missing = estate({ pass: { count: 1, severity: null } });
    expect(toMachineModel(ADMIN, missing, CATALOG, KEYS).screen).toBe(
      "ESTATE UNREADABLE",
    );
  });

  it("says nothing needs you to a visitor whose estate is clear and fully read", () => {
    expect(
      toMachineModel(USER, estate(READ, [], "USER"), CATALOG, KEYS).screen,
    ).toBe("NOTHING NEEDS YOU");
  });
});

describe("a definite count is never printed over an estate that is only partly read", () => {
  it("hedges the count when a tool could not be read", () => {
    const partial = estate({ ...READ, pass: null }, [
      { kind: "a" },
      { kind: "b" },
    ]);
    expect(toMachineModel(ADMIN, partial, CATALOG, KEYS).screen).toBe(
      "2+ NEED YOU",
    );
  });

  it("states the count plainly when every tool was read", () => {
    expect(
      toMachineModel(ADMIN, estate(READ, [{ kind: "a" }]), CATALOG, KEYS)
        .screen,
    ).toBe("1 NEEDS YOU");
  });
});

describe("an unrecognized role defaults to guest, not to visitor", () => {
  it("treats a role that is neither ADMIN nor USER as guest", () => {
    const model = toMachineModel(
      { authenticated: true, identity: { role: "SOMETHING_ELSE" } },
      null,
      CATALOG,
      KEYS,
    );
    expect(model.access).toBe("guest");
  });
});

describe("what the machine needs to draw a person", () => {
  it("names the pass holder only when someone is signed in", () => {
    expect(
      toMachineModel({ authenticated: false }, null, CATALOG, KEYS).holder,
    ).toBeNull();
    const named = toMachineModel(
      {
        authenticated: true,
        identity: { role: "USER", username: "annisa", email: "a@x.test" },
      },
      estate(READ),
      CATALOG,
      KEYS,
    );
    expect(named.holder).toBe("annisa");
    const unnamed = toMachineModel(
      {
        authenticated: true,
        identity: { role: "USER", username: null, email: "rafi@x.test" },
      },
      estate(READ),
      CATALOG,
      KEYS,
    );
    expect(unnamed.holder).toBe("rafi");
    expect(unnamed.email).toBe("rafi@x.test");
    expect(
      toMachineModel({ authenticated: false }, null, CATALOG, KEYS).email,
    ).toBeNull();
  });

  it("gives a guest no counts at all, because an estate belongs to a person", () => {
    expect(
      toMachineModel({ authenticated: false }, null, CATALOG, KEYS).indicators,
    ).toBeNull();
  });

  it("reads every bay's app, and calls an unread estate unknown rather than empty", () => {
    const read = toMachineModel(ADMIN, estate(READ), CATALOG, KEYS);
    expect(read.indicators?.["notes"]).toEqual({ count: 0, severity: null });
    const unread = toMachineModel(ADMIN, null, CATALOG, KEYS);
    expect(unread.indicators?.["notes"]).toBe("unknown");
  });
});

describe("the ticker", () => {
  it("welcomes a guest by the site's name", () => {
    expect(
      toMachineModel({ authenticated: false }, null, CATALOG, KEYS, "Pawl")
        .ticker,
    ).toBe("WELCOME TO PAWL · PICK A BAY · SIGN IN FOR MORE");
  });

  it("says an empty machine is ready, whoever stands there", () => {
    expect(
      toMachineModel({ authenticated: false }, null, [], KEYS, "Pawl").ticker,
    ).toBe("NO APPS YET · PAWL IS READY");
    expect(toMachineModel(ADMIN, estate(READ), [], KEYS, "Pawl").ticker).toBe(
      "NO APPS YET · PAWL IS READY",
    );
  });

  it("leads with the estate line, then each estate app's count, never a zero it did not read", () => {
    expect(
      toMachineModel(ADMIN, estate(READ), CATALOG, KEYS, "Pawl").ticker,
    ).toBe("NOTHING NEEDS YOU · NOTE 0");
    expect(toMachineModel(ADMIN, null, CATALOG, KEYS, "Pawl").ticker).toBe(
      "ESTATE UNREADABLE · NOTE --",
    );
  });
});
