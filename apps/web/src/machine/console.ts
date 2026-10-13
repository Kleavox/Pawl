import type { ScreenView } from "./render";
import type { MachineHost } from "./state";

const CONTROL =
  "button:not([disabled]):not([hidden]), a[href]:not([hidden]), input:not([disabled]):not([hidden])";

const LEAVES_ON_ESCAPE = new Set([
  "methods",
  "email",
  "otp-machine",
  "account",
]);

export function mountTerminal(root: ParentNode, machine: MachineHost): void {
  for (const back of root.querySelectorAll<HTMLButtonElement>(
    "[data-step-back]",
  )) {
    back.addEventListener("click", () => machine.dispatch({ type: "back" }));
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (!LEAVES_ON_ESCAPE.has(machine.read().authStep)) return;
    event.preventDefault();
    machine.dispatch({ type: "cancel" });
  });
}

export function followView(
  root: ParentNode,
  previous: ScreenView | null,
  next: ScreenView,
  returnTo: HTMLElement | null = null,
): void {
  if (previous === null || previous === next) return;
  const panel = root.querySelector<HTMLElement>(`[data-view-panel="${next}"]`);
  if (panel === null) return;
  if (
    returnTo !== null &&
    returnTo.isConnected &&
    panel.contains(returnTo) &&
    returnTo.matches(CONTROL)
  ) {
    returnTo.focus({ preventScroll: true });
    return;
  }
  const marked = panel.matches("[data-autofocus]")
    ? panel
    : panel.querySelector<HTMLElement>("[data-autofocus]");
  const target =
    marked ??
    (panel.matches("[tabindex]")
      ? panel
      : panel.querySelector<HTMLElement>(CONTROL));
  target?.focus({ preventScroll: true });
}
