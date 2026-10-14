import { describe, expect, it } from "vitest";

import {
  BACK,
  initialFlow,
  methodChoices,
  pageOf,
  passKeys,
  reduceFlow,
  type PassView,
} from "./flow";

describe("methodChoices", () => {
  it("numbers the methods it can offer, in order", () => {
    expect(methodChoices({ google: true, github: false })).toEqual([
      { key: "1", method: "google" },
      { key: "2", method: "email" },
      { key: "3", method: "password" },
    ]);
    expect(methodChoices({ google: true, github: true })).toEqual([
      { key: "1", method: "google" },
      { key: "2", method: "github" },
      { key: "3", method: "email" },
      { key: "4", method: "password" },
    ]);
  });
});

describe("the email code", () => {
  it("takes six digits and lights GO only then", () => {
    let s = reduceFlow(
      { ...initialFlow(), view: "code", email: "a@b.test" },
      { type: "digit", digit: "1" },
    );
    expect(passKeys(s, 0).has("GO")).toBe(false);
    for (const d of "23456") s = reduceFlow(s, { type: "digit", digit: d });
    expect(s.digits).toBe("123456");
    expect(passKeys(s, 0).has("GO")).toBe(true);
    expect(passKeys(s, 0).has("7")).toBe(false);
    expect(reduceFlow(s, { type: "digit", digit: "7" }).digits).toBe("123456");
  });

  it("ignores digits on any other view", () => {
    const methods = { ...initialFlow(), view: "methods" as const };
    expect(reduceFlow(methods, { type: "digit", digit: "1" })).toBe(methods);
  });

  it("erases a digit, and on an empty code steps back to the email with the address kept", () => {
    const one = {
      ...initialFlow(),
      view: "code" as const,
      email: "a@b.test",
      digits: "1",
    };
    const empty = reduceFlow(one, { type: "erase" });
    expect(empty.digits).toBe("");
    const back = reduceFlow(empty, { type: "erase" });
    expect(back.view).toBe("email");
    expect(back.email).toBe("a@b.test");
  });

  it("opens the code step with the address kept and nothing typed", () => {
    const sent = reduceFlow(
      { ...initialFlow(), view: "email", digits: "99" },
      { type: "code-sent", email: "a@b.test" },
    );
    expect([sent.view, sent.email, sent.digits]).toEqual([
      "code",
      "a@b.test",
      "",
    ]);
  });

  it("clears the code and says the tries left when a code is wrong; a locked code returns to the email", () => {
    const typed = { ...initialFlow(), view: "code" as const, digits: "123456" };
    const wrong = reduceFlow(typed, { type: "code-rejected", attemptsLeft: 3 });
    expect([wrong.digits, wrong.attemptsLeft]).toEqual(["", 3]);
    const locked = reduceFlow(typed, {
      type: "code-locked",
      text: "Too many tries.",
    });
    expect(locked.view).toBe("email");
    expect(locked.say).toEqual({ kind: "error", text: "Too many tries." });
  });
});

describe("stepping back", () => {
  it("walks back one step at a time and never past the first", () => {
    for (const [from, to] of Object.entries(BACK)) {
      expect(
        reduceFlow(
          { ...initialFlow(), view: from as PassView },
          { type: "back" },
        ).view,
      ).toBe(to);
    }
    const methods = { ...initialFlow(), view: "methods" as const };
    expect(reduceFlow(methods, { type: "back" }).view).toBe("methods");
  });
});

describe("pageOf", () => {
  it("pages three at a time and clamps a page that emptied", () => {
    expect(pageOf([1, 2, 3, 4, 5, 6, 7], 2)).toEqual({
      rows: [7],
      page: 2,
      pages: 3,
    });
    expect(pageOf([1, 2, 3, 4, 5, 6], 2)).toEqual({
      rows: [4, 5, 6],
      page: 1,
      pages: 2,
    });
    expect(pageOf([], 0)).toEqual({ rows: [], page: 0, pages: 1 });
  });

  it("moves the page within the list and no further", () => {
    const at = { ...initialFlow(), view: "devices" as const };
    const next = reduceFlow(at, { type: "page", step: 1, total: 3 });
    expect(next.page).toBe(1);
    expect(reduceFlow(at, { type: "page", step: -1, total: 3 }).page).toBe(0);
    expect(
      reduceFlow({ ...at, page: 2 }, { type: "page", step: 1, total: 3 }).page,
    ).toBe(2);
  });
});

describe("arriving and signing in", () => {
  it("lands a signed-in visitor without a username on welcome, others on the account", () => {
    expect(
      reduceFlow(initialFlow(), {
        type: "arrived",
        route: "/",
        signedIn: true,
        needsUsername: true,
      }).view,
    ).toBe("welcome");
    expect(
      reduceFlow(initialFlow(), {
        type: "arrived",
        route: "/",
        signedIn: true,
        needsUsername: false,
      }).view,
    ).toBe("account");
    expect(
      reduceFlow(initialFlow(), {
        type: "arrived",
        route: "/",
        signedIn: false,
        needsUsername: false,
      }).view,
    ).toBe("methods");
    expect(
      reduceFlow(initialFlow(), {
        type: "arrived",
        route: "/reset",
        signedIn: false,
        needsUsername: false,
      }).view,
    ).toBe("reset");
  });

  it("sends a new sign-in to welcome when it needs a username, otherwise to the account", () => {
    const code = { ...initialFlow(), view: "code" as const, digits: "123456" };
    expect(
      reduceFlow(code, { type: "signed-in", needsUsername: true }).view,
    ).toBe("welcome");
    expect(
      reduceFlow(code, { type: "signed-in", needsUsername: false }).view,
    ).toBe("account");
  });

  it("shows what was sent after a register or a reset link", () => {
    const done = reduceFlow(
      { ...initialFlow(), view: "register-key" },
      { type: "done", text: "Check your inbox." },
    );
    expect(done.view).toBe("sent");
    expect(done.say).toEqual({ kind: "success", text: "Check your inbox." });
  });

  it("returns to the methods when signed out, with nothing left behind", () => {
    const out = reduceFlow(
      { ...initialFlow(), view: "security", page: 2, digits: "12" },
      { type: "signed-out" },
    );
    expect([out.view, out.page, out.digits]).toEqual(["methods", 0, ""]);
  });

  it("opens a view fresh: no old message, no digits, the first page", () => {
    const opened = reduceFlow(
      {
        ...initialFlow(),
        view: "account",
        say: { kind: "error", text: "x" },
        page: 2,
      },
      { type: "open", view: "devices" },
    );
    expect([opened.view, opened.say, opened.page]).toEqual([
      "devices",
      null,
      0,
    ]);
  });
});

describe("passKeys", () => {
  it("lights the numbered choices on the methods and the four sections on the account", () => {
    const methods = { ...initialFlow(), view: "methods" as const };
    expect([...passKeys(methods, 3)].sort()).toEqual(["1", "2", "3"]);
    const account = { ...initialFlow(), view: "account" as const };
    expect([...passKeys(account, 0)].sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("lights CLR and GO on a step with a form, CLR alone on a section, nothing while loading", () => {
    expect(
      [...passKeys({ ...initialFlow(), view: "password" }, 0)].sort(),
    ).toEqual(["CLR", "GO"]);
    expect([...passKeys({ ...initialFlow(), view: "devices" }, 0)]).toEqual([
      "CLR",
    ]);
    expect([...passKeys(initialFlow(), 0)]).toEqual([]);
  });

  it("goes dark while a step is busy", () => {
    expect([
      ...passKeys({ ...initialFlow(), view: "password", busy: true }, 0),
    ]).toEqual([]);
  });
  it("steps back from a page that is gone with one press", () => {
    const after = reduceFlow(
      { ...initialFlow(), view: "devices", page: 2 },
      { type: "page", step: -1, total: 2 },
    );
    expect(after.page).toBe(0);
  });
});
