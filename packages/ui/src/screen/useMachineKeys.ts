import { useEffect, useRef } from "react";

const PRESSABLE = new Set([
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "GO",
  "CLR",
]);
const TYPING = "input, textarea, select, button, a, [contenteditable]";
const TEXT_ENTRY = "input, textarea, select, [contenteditable]";
const PRESS_MS = 120;

export function pressCap(key: string): void {
  const cap = document.querySelector<HTMLElement>(`[data-key="${key}"]`);
  if (cap === null) return;
  cap.classList.add("is-pressed");
  setTimeout(() => cap.classList.remove("is-pressed"), PRESS_MS);
}

export function useMachineKeys(
  onKey: (key: string) => void,
  lit: ReadonlySet<string>,
): void {
  const latest = useRef({ onKey, lit });
  latest.current = { onKey, lit };
  useEffect(() => {
    const listen = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const pressed =
        event.key === "Enter"
          ? "GO"
          : event.key === "Backspace"
            ? "CLR"
            : event.key;
      if (!PRESSABLE.has(pressed)) return;
      const guarded = pressed === "GO" ? TYPING : TEXT_ENTRY;
      if (event.target instanceof Element && event.target.closest(guarded)) {
        return;
      }
      event.preventDefault();
      pressCap(pressed);
      if (latest.current.lit.has(pressed)) latest.current.onKey(pressed);
    };
    document.addEventListener("keydown", listen);
    return () => document.removeEventListener("keydown", listen);
  }, []);
}
