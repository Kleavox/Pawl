import { afterEach, describe, expect, it, vi } from "vitest";
import { mountConsole, mountTerminal } from "./console";
import type { MachineHost } from "./state";
import { initialState, reduce, type MachineEvent } from "./state";

function store(): { host: MachineHost; seen: MachineEvent[] } {
  let state = initialState("guest");
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

function media(sheet: boolean): void {
  vi.stubGlobal("matchMedia", () => ({
    matches: sheet,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mountConsole", () => {
  it("tells the store the layout before anything can render the default", () => {
    media(false);
    const root = document.createElement("div");
    root.innerHTML = `
      <aside data-console="closed"><button data-console-close></button></aside>
      <button data-dock aria-expanded="false"></button>`;
    const { host, seen } = store();
    mountConsole(root, host);
    expect(seen[0]).toEqual({ type: "console-layout", layout: "column" });
    expect(host.read().consoleLayout).toBe("column");
  });

  it("still reports the layout when there is no dock to hang the console on", () => {
    media(false);
    const root = document.createElement("div");
    root.innerHTML = `<aside data-console="closed"></aside>`;
    const { host, seen } = store();
    mountConsole(root, host);
    expect(seen).toContainEqual({ type: "console-layout", layout: "column" });
    expect(host.read().consoleLayout).toBe("column");
  });

  it("reports the sheet layout on a narrow viewport", () => {
    media(true);
    const root = document.createElement("div");
    root.innerHTML = `<aside data-console="closed"></aside>`;
    const { host, seen } = store();
    mountConsole(root, host);
    expect(seen).toContainEqual({ type: "console-layout", layout: "sheet" });
    expect(host.read().consoleLayout).toBe("sheet");
  });
});

describe("mountTerminal", () => {
  function terminalRoot(): { root: HTMLElement; terminal: HTMLElement } {
    const root = document.createElement("div");
    root.innerHTML = `
      <dialog data-terminal><button data-terminal-close></button></dialog>`;
    const terminal = root.querySelector("[data-terminal]") as HTMLElement;
    return { root, terminal };
  }

  it("gives the machine back when the terminal is closed at the method step", () => {
    const { root, terminal } = terminalRoot();
    const { host, seen } = store();
    host.dispatch({ type: "pass-tap" });
    host.dispatch({ type: "reader-scanned" });
    mountTerminal(root, host);
    terminal.dispatchEvent(new Event("close"));
    expect(seen).toContainEqual({ type: "cancel" });
    expect(host.read().busy).toBe(false);
    expect(host.read().authStep).toBe("closed");
  });

  it("keeps the code alive when the terminal closes after the code was sent", () => {
    const { root, terminal } = terminalRoot();
    const { host, seen } = store();
    host.dispatch({ type: "pass-tap" });
    host.dispatch({ type: "reader-scanned" });
    host.dispatch({ type: "otp-sent" });
    mountTerminal(root, host);
    terminal.dispatchEvent(new Event("close"));
    expect(seen).not.toContainEqual({ type: "cancel" });
    expect(host.read().authStep).toBe("otp-machine");
  });

  it("keeps the bay the guest asked for, so a later pass still opens it", () => {
    const { root, terminal } = terminalRoot();
    const { host } = store();
    host.dispatch({ type: "select", bay: "1" });
    host.dispatch({ type: "pass-tap" });
    host.dispatch({ type: "reader-scanned" });
    mountTerminal(root, host);
    terminal.dispatchEvent(new Event("close"));
    expect(host.read().authRequest).toBe("1");
  });
});
