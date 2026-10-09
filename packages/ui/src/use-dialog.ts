import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function focusableWithin(node: HTMLElement): HTMLElement[] {
  return [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => {
      if (element.getAttribute("aria-hidden") === "true") return false;
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    },
  );
}

export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    const restoreOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        latest.current();
        return;
      }
      if (event.key !== "Tab") return;

      const node = ref.current;
      if (!node) return;
      const stops = focusableWithin(node);
      if (stops.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }

      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const active = document.activeElement;
      const inside = active instanceof Node && node.contains(active);

      if (event.shiftKey) {
        if (!inside || active === first || active === node) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = restoreOverflow;
      restoreTo?.focus?.();
    };
  }, []);

  return ref;
}
