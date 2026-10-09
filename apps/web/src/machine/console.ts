import type { MachineHost } from "./state";

const SHEET_QUERY = "(max-width: 760px)";

export function mountConsole(root: ParentNode, machine: MachineHost): void {
  const sheet = window.matchMedia(SHEET_QUERY);
  machine.dispatch({
    type: "console-layout",
    layout: sheet.matches ? "sheet" : "column",
  });

  const panel = root.querySelector<HTMLElement>("[data-console]");
  const dock = root.querySelector<HTMLButtonElement>("[data-dock]");
  if (!panel || !dock) return;

  const scrim = root.querySelector<HTMLElement>("[data-scrim]");
  const closer = root.querySelector<HTMLButtonElement>("[data-console-close]");
  const reader = root.querySelector<HTMLElement>("[data-reader]");
  const terminal = root.querySelector<HTMLDialogElement>("[data-terminal]");

  const setOpen = (open: boolean): void => {
    const next = machine.dispatch({ type: "console", open });
    if (next.consoleLayout !== "sheet") return;
    if (next.consoleOpen) {
      window.requestAnimationFrame(() =>
        reader?.focus({ preventScroll: true }),
      );
      return;
    }
    dock.focus({ preventScroll: true });
  };

  const syncLayout = (): void => {
    const kept = panel.contains(document.activeElement);
    const next = machine.dispatch({
      type: "console-layout",
      layout: sheet.matches ? "sheet" : "column",
    });
    const open = next.consoleLayout === "column" || next.consoleOpen;
    const sealed = next.consoleLayout === "sheet" && open;
    if (!open && kept) {
      dock.focus({ preventScroll: true });
      return;
    }
    if (sealed && !kept) reader?.focus({ preventScroll: true });
  };

  dock.addEventListener("click", () => setOpen(true));
  closer?.addEventListener("click", () => setOpen(false));
  scrim?.addEventListener("click", () => setOpen(false));
  sheet.addEventListener("change", syncLayout);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (terminal?.open === true) return;
    const state = machine.read();
    if (state.consoleLayout !== "sheet" || !state.consoleOpen) return;
    event.preventDefault();
    setOpen(false);
  });

  syncLayout();
}

export function mountTerminal(root: ParentNode, machine: MachineHost): void {
  const terminal = root.querySelector<HTMLDialogElement>("[data-terminal]");
  if (!terminal) return;

  for (const closer of root.querySelectorAll<HTMLButtonElement>(
    "[data-terminal-close]",
  )) {
    closer.addEventListener("click", () => terminal.close());
  }

  terminal.addEventListener("close", () => {
    if (machine.read().authStep !== "methods") return;
    machine.dispatch({ type: "cancel" });
  });
}
