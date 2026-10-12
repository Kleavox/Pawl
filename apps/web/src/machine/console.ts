import type { ScreenView } from "./render";
import type { MachineHost } from "./state";

const AUTH_VIEWS: ReadonlySet<ScreenView> = new Set([
  "signin",
  "code",
  "working",
]);

const CONTROL = "button:not([disabled]), a[href], input:not([disabled])";

export function mountTerminal(root: ParentNode, machine: MachineHost): void {
  root
    .querySelector<HTMLButtonElement>("[data-terminal-close]")
    ?.addEventListener("click", () => machine.dispatch({ type: "cancel" }));
  root
    .querySelector<HTMLButtonElement>("[data-code-close]")
    ?.addEventListener("click", () => machine.dispatch({ type: "otp-back" }));

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const step = machine.read().authStep;
    if (step !== "methods" && step !== "otp-machine") return;
    event.preventDefault();
    machine.dispatch({ type: "cancel" });
  });
}

export function followView(
  root: ParentNode,
  previous: ScreenView | null,
  next: ScreenView,
): void {
  if (previous === null || previous === next) return;
  const panel = root.querySelector<HTMLElement>(`[data-view-panel="${next}"]`);
  if (panel === null) return;
  const marked = panel.matches("[data-autofocus]")
    ? panel
    : panel.querySelector<HTMLElement>("[data-autofocus]");
  const target =
    marked ??
    (AUTH_VIEWS.has(previous)
      ? panel.matches("[tabindex]")
        ? panel
        : panel.querySelector<HTMLElement>(CONTROL)
      : null);
  target?.focus({ preventScroll: true });
}
