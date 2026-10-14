import { useLayoutEffect, useRef, type RefObject } from "react";

const CONTROL =
  "button:not([disabled]):not([hidden]), a[href]:not([hidden]), input:not([disabled]):not([hidden])";

export function followView(
  root: ParentNode,
  next: string,
  returnTo: HTMLElement | null,
): void {
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

export function useFollowFocus(
  views: RefObject<HTMLElement | null>,
  shown: string,
  returnTo: RefObject<HTMLElement | null>,
): void {
  const before = useRef<string | null>(null);
  useLayoutEffect(() => {
    const previous = before.current;
    before.current = shown;
    if (previous === null || previous === shown || views.current === null) {
      return;
    }
    followView(views.current, shown, returnTo.current);
  }, [shown, views, returnTo]);
}
