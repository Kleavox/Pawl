import { describe, expect, it } from "vitest";
import { toMachineModel } from "./estate-adapter";

describe("machine model", () => {
  it("reads INSERT PASS for a signed out visitor and lights only portfolio", () => {
    const model = toMachineModel({ authenticated: false }, null);
    expect(model.access).toBe("guest");
    expect(model.screen).toBe("INSERT PASS");
    expect(
      model.items.filter((item) => item.lit).map((item) => item.code),
    ).toEqual(["3"]);
  });

  it("counts what needs attention on the screen", () => {
    const model = toMachineModel(
      { authenticated: true, identity: { role: "ADMIN" } },
      {
        role: "ADMIN",
        pass: { devices: 1 },
        link: { active: 3, files: 0, reported: 1, expiringSoon: 0 },
        attention: [{ kind: "abuse-report" }, { kind: "link-expiring" }],
      } as never,
    );
    expect(model.screen).toBe("2 NEED ATTENTION");
  });

  it("says nothing needs you when the estate is clear and fully known", () => {
    const model = toMachineModel(
      { authenticated: true, identity: { role: "ADMIN" } },
      {
        role: "ADMIN",
        pass: { devices: 1 },
        link: { active: 0, files: 0, reported: 0, expiringSoon: 0 },
        attention: [],
      } as never,
    );
    expect(model.screen).toBe("NOTHING NEEDS YOU");
  });

  it("says the estate is unreadable rather than showing a calm machine", () => {
    const model = toMachineModel(
      { authenticated: true, identity: { role: "ADMIN" } },
      null,
    );
    expect(model.screen).toBe("ESTATE UNREADABLE");
  });

  it("does not call an estate of all-silent blocks a readable one", () => {
    const model = toMachineModel(
      { authenticated: true, identity: { role: "ADMIN" } },
      {
        role: "ADMIN",
        pass: null,
        link: null,
        attention: [],
      } as never,
    );
    expect(model.screen).toBe("ESTATE UNREADABLE");
  });
});

describe("bay lighting follows POLICY, not a second table", () => {
  it("lights every bay for an owner, and there is no bay 2 since monitoring left", () => {
    const model = toMachineModel(
      { authenticated: true, identity: { role: "ADMIN" } },
      null,
    );
    expect(model.items.map((item) => item.code)).toEqual(["1", "3"]);
    expect(
      model.items.filter((item) => item.lit).map((item) => item.code),
    ).toEqual(["1", "3"]);
  });

  it("lights link and portfolio for a visitor", () => {
    const model = toMachineModel(
      { authenticated: true, identity: { role: "USER" } },
      null,
    );
    expect(
      model.items.filter((item) => item.lit).map((item) => item.code),
    ).toEqual(["1", "3"]);
  });
});

describe("a partially unreadable estate is never mistaken for a quiet one", () => {
  it("does not say nothing needs you when a block could not be read, even with no attention items", () => {
    const model = toMachineModel(
      { authenticated: true, identity: { role: "ADMIN" } },
      {
        role: "ADMIN",
        pass: null,
        link: { active: 0, files: 0, reported: 0, expiringSoon: 0 },
        attention: [],
      } as never,
    );
    expect(model.screen).not.toBe("NOTHING NEEDS YOU");
    expect(model.screen).toBe("ESTATE UNREADABLE");
  });

  it("says nothing needs you to a visitor whose estate is clear and fully read", () => {
    const model = toMachineModel(
      { authenticated: true, identity: { role: "USER" } },
      {
        role: "USER",
        pass: { devices: 1 },
        link: { active: 0, files: 0, reported: 0, expiringSoon: 0 },
        attention: [],
      } as never,
    );
    expect(model.screen).toBe("NOTHING NEEDS YOU");
  });
});

describe("a definite count is never printed over an estate that is only partly read", () => {
  it("hedges the count when a permitted block could not be read", () => {
    const model = toMachineModel(
      { authenticated: true, identity: { role: "ADMIN" } },
      {
        role: "ADMIN",
        pass: null,
        link: { active: 0, files: 0, reported: 0, expiringSoon: 0 },
        attention: [{ kind: "abuse-report" }, { kind: "link-expiring" }],
      } as never,
    );
    expect(model.screen).toBe("AT LEAST 2 NEED ATTENTION");
  });

  it("states the count plainly when every permitted block was read", () => {
    const model = toMachineModel(
      { authenticated: true, identity: { role: "ADMIN" } },
      {
        role: "ADMIN",
        pass: { devices: 1 },
        link: { active: 0, files: 0, reported: 0, expiringSoon: 0 },
        attention: [{ kind: "abuse-report" }, { kind: "link-expiring" }],
      } as never,
    );
    expect(model.screen).toBe("2 NEED ATTENTION");
  });

  it("states a visitor's count plainly when every block was read", () => {
    const model = toMachineModel(
      { authenticated: true, identity: { role: "USER" } },
      {
        role: "USER",
        pass: { devices: 1 },
        link: { active: 0, files: 0, reported: 0, expiringSoon: 0 },
        attention: [{ kind: "link-expiring" }],
      } as never,
    );
    expect(model.screen).toBe("1 NEED ATTENTION");
  });
});

describe("an unrecognized role defaults to guest, not to visitor", () => {
  it("treats a role that is neither ADMIN nor USER as guest, not as a quiet visitor grant", () => {
    const model = toMachineModel(
      { authenticated: true, identity: { role: "SOMETHING_ELSE" } },
      null,
    );
    expect(model.access).toBe("guest");
  });
});
