import { afterEach, describe, expect, it } from "vitest";
import { followView, mountTerminal } from "./console";
import type { MachineHost } from "./state";
import { initialState, reduce, type MachineEvent } from "./state";
import { CATALOG } from "./catalog.testkit";

function store(): { host: MachineHost; seen: MachineEvent[] } {
  let state = initialState("guest", CATALOG);
  const seen: MachineEvent[] = [];
  return {
    seen,
    host: {
      read: () => state,
      dispatch: (event) => {
        seen.push(event);
        state = reduce(state, event);
        return state;
      },
    },
  };
}

function screen(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <section data-view-panel="products" tabindex="-1"><button data-terminal-open>Sign in</button><a href="#">Create an account</a></section>
    <section data-view-panel="signin" hidden><button data-autofocus>Continue with Google</button><button data-terminal-close data-step-back>Back</button></section>
    <section data-view-panel="code" tabindex="-1" data-autofocus hidden><button data-code-close data-step-back>Use another email</button></section>
    <section data-view-panel="account" tabindex="-1" hidden><a href="/account">Manage account</a></section>`;
  document.body.append(root);
  return root;
}

function opened(host: MachineHost): void {
  host.dispatch({ type: "open-sign-in" });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("mountTerminal", () => {
  it("hands the machine back when Back is pressed on the sign-in view", () => {
    const { host } = store();
    const root = screen();
    mountTerminal(root, host);
    opened(host);
    expect(host.read().authStep).toBe("methods");
    root
      .querySelector<HTMLButtonElement>(
        "[data-view-panel='signin'] [data-terminal-close]",
      )!
      .click();
    expect(host.read().authStep).toBe("closed");
    expect(host.read().busy).toBe(false);
  });

  it("steps back to the email field when Use another email is pressed", () => {
    const { host } = store();
    const root = screen();
    mountTerminal(root, host);
    opened(host);
    host.dispatch({ type: "email-chosen" });
    host.dispatch({ type: "otp-sent" });
    root.querySelector<HTMLButtonElement>("[data-code-close]")!.click();
    expect(host.read().authStep).toBe("email");
  });

  it("keeps the bay the guest asked for, so a later pass still opens it", () => {
    const { host } = store();
    const root = screen();
    mountTerminal(root, host);
    host.dispatch({ type: "select", bay: "1" });
    opened(host);
    root.querySelector<HTMLButtonElement>("[data-terminal-close]")!.click();
    expect(host.read().authRequest).toBe("1");
  });

  it("lets Escape leave a sign-in, and leaves the machine alone otherwise", () => {
    const { host, seen } = store();
    mountTerminal(screen(), host);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(seen.filter((event) => event.type === "cancel")).toHaveLength(0);
    opened(host);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(host.read().authStep).toBe("closed");
  });

  it("lets Escape leave the account screen for the products", () => {
    let state = initialState("owner", CATALOG);
    const host: MachineHost = {
      read: () => state,
      dispatch: (event) => (state = reduce(state, event)),
    };
    mountTerminal(screen(), host);
    host.dispatch({ type: "open-account" });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(host.read().authStep).toBe("closed");
  });
});

describe("followView", () => {
  it("rests on the products panel after a sign-in, so Enter presses GO and follows no link", () => {
    const root = screen();
    followView(root, "working", "products");
    expect(document.activeElement).toBe(
      root.querySelector("[data-view-panel='products']"),
    );
  });

  it("returns to the control that left the products, when it is still there", () => {
    const root = screen();
    const link = root.querySelector<HTMLElement>("a[href='#']")!;
    followView(root, "signin", "products", link);
    expect(document.activeElement).toBe(link);
  });

  it("falls back to the products panel when the control that left is now hidden", () => {
    const root = screen();
    const opener = root.querySelector<HTMLElement>("[data-terminal-open]")!;
    opener.hidden = true;
    followView(root, "working", "products", opener);
    expect(document.activeElement).toBe(
      root.querySelector("[data-view-panel='products']"),
    );
  });

  it("puts focus into the account screen when it opens", () => {
    const root = screen();
    followView(root, "products", "account");
    expect(document.activeElement).toBe(
      root.querySelector("[data-view-panel=\x27account\x27]"),
    );
  });

  it("does not steal focus when the page first paints", () => {
    const root = screen();
    followView(root, null, "signin");
    expect(document.activeElement).toBe(document.body);
  });

  it("puts focus on the first control of a view that opens", () => {
    const root = screen();
    followView(root, "products", "signin");
    expect(document.activeElement?.textContent).toBe("Continue with Google");
  });

  it("puts focus on the code view itself, so typed digits reach the keypad", () => {
    const root = screen();
    followView(root, "signin", "code");
    expect(document.activeElement).toBe(
      root.querySelector("[data-view-panel='code']"),
    );
  });

  it("returns focus to the products panel when nothing remembers what opened the sign-in", () => {
    const root = screen();
    followView(root, "signin", "products");
    expect(document.activeElement).toBe(
      root.querySelector("[data-view-panel='products']"),
    );
  });

  it("does nothing when the view did not change", () => {
    const root = screen();
    followView(root, "products", "products");
    expect(document.activeElement).toBe(document.body);
  });
});
