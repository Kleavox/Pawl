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
    <section data-view-panel="idle"><button data-terminal-open>Sign in</button><a href="#">Create an account</a></section>
    <section data-view-panel="signin" hidden><button data-autofocus>Continue with Google</button><button data-terminal-close data-step-back>Back</button></section>
    <section data-view-panel="code" tabindex="-1" data-autofocus hidden><button data-code-close data-step-back>Use another email</button></section>
    <section data-view-panel="signed-in" tabindex="-1" hidden><a href="/account">Manage account</a></section>`;
  document.body.append(root);
  return root;
}

function opened(host: MachineHost): void {
  host.dispatch({ type: "pass-tap" });
  host.dispatch({ type: "reader-scanned" });
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
});

describe("followView", () => {
  it("rests on the signed-in screen after a sign-in, not on a link out of the machine", () => {
    const root = screen();
    followView(root, "working", "signed-in");
    expect(document.activeElement).toBe(
      root.querySelector("[data-view-panel=\x27signed-in\x27]"),
    );
  });

  it("leaves focus alone when a pass already in the machine is read on load", () => {
    const root = screen();
    followView(root, "idle", "signed-in");
    expect(document.activeElement).toBe(document.body);
  });

  it("does not steal focus when the page first paints", () => {
    const root = screen();
    followView(root, null, "signin");
    expect(document.activeElement).toBe(document.body);
  });

  it("puts focus on the first control of a view that opens", () => {
    const root = screen();
    followView(root, "idle", "signin");
    expect(document.activeElement?.textContent).toBe("Continue with Google");
  });

  it("puts focus on the code view itself, so typed digits reach the keypad", () => {
    const root = screen();
    followView(root, "signin", "code");
    expect(document.activeElement).toBe(
      root.querySelector("[data-view-panel='code']"),
    );
  });

  it("returns focus to the first control when a sign-in is left", () => {
    const root = screen();
    followView(root, "signin", "idle");
    expect(document.activeElement).toBe(
      root.querySelector("[data-terminal-open]"),
    );
  });

  it("does nothing when the view did not change", () => {
    const root = screen();
    followView(root, "idle", "idle");
    expect(document.activeElement).toBe(document.body);
  });
});
