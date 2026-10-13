import { escapeHtml, renderMachine } from "@pawl/core";

import type { Mode } from "./types";

export const SCREEN_FORM = "screen-form";

const MODES: readonly Mode[] = ["login", "register", "forgot"];

export function initialMode(search: string): Mode {
  const wanted = new URLSearchParams(search).get("mode");
  return MODES.find((mode) => mode === wanted) ?? "login";
}

export type Holder = { handle: string; role: "ADMIN" | "USER" };

export type Screen = {
  status: string;
  sub?: string;
  go: boolean;
  back?: () => void;
};

type Text = { textContent: string | null };

export type MachineParts = {
  machine: HTMLElement;
  chip: HTMLElement;
  word: Text;
  main: Text;
  sub: Text;
  where: Text;
  clr: HTMLButtonElement;
  go: HTMLButtonElement;
};

function access(holder: Holder | null): "guest" | "owner" | "visitor" {
  if (holder === null) return "guest";
  return holder.role === "ADMIN" ? "owner" : "visitor";
}

export function machineShell(siteName: string, rootOrigin: string): string {
  const root = escapeHtml(rootOrigin);
  return renderMachine({
    siteName,
    rootOrigin,
    framing: "whole",
    ticker: `${siteName.toUpperCase()} ACCOUNT · ONE PASS FOR EVERY BAY`,
    chip: { state: "guest", word: "GUEST MODE" },
    display: `<div class="pass-screen"><div class="pass-bar"><span class="pass-bar__where" data-pass-where>ONE MOMENT</span><a class="pass-bar__machine" href="${root}/" data-to-machine>‹ MACHINE</a></div><div class="pass-view" id="screen"></div><div class="pass-foot" aria-hidden="true"><span><kbd>CLR</kbd> back</span><span><kbd class="is-go">GO</kbd> continue</span></div></div>`,
    lcd: { main: "ONE MOMENT", sub: "" },
    keypad: {
      mode: "service",
      clr: { kind: "button" },
      go: { kind: "submit", form: SCREEN_FORM },
    },
    machine: { "data-access": "guest", "data-view": "account" },
  });
}

export function machineParts(root: ParentNode): MachineParts | null {
  const find = <T extends Element>(selector: string): T | null =>
    root.querySelector<T>(selector);
  const parts = {
    machine: find<HTMLElement>("[data-machine]"),
    chip: find<HTMLElement>("[data-cabinet-state]"),
    word: find<HTMLElement>("[data-cabinet-word]"),
    main: find<HTMLElement>("[data-screen]"),
    sub: find<HTMLElement>("[data-screen-sub]"),
    where: find<HTMLElement>("[data-pass-where]"),
    clr: find<HTMLButtonElement>("button[data-key='CLR']"),
    go: find<HTMLButtonElement>(`button[form='${SCREEN_FORM}']`),
  };
  return Object.values(parts).includes(null) ? null : (parts as MachineParts);
}

function write(node: Text, words: string): void {
  if (node.textContent !== words) node.textContent = words;
}

export function paintMachine(
  parts: MachineParts,
  screen: Screen,
  holder: Holder | null,
): void {
  const who = access(holder);
  const handle = holder?.handle.toUpperCase() ?? "";
  parts.machine.dataset.access = who;
  parts.chip.dataset.cabinetState = who;
  write(parts.word, `${who.toUpperCase()} MODE`);
  write(parts.main, screen.status);
  write(
    parts.sub,
    holder === null
      ? (screen.sub ?? "")
      : `${handle} · ${who.toUpperCase()} PASS`,
  );
  write(
    parts.where,
    holder === null ? screen.status : `HI, ${handle} · ${who.toUpperCase()}`,
  );
  parts.clr.disabled = screen.back === undefined;
  parts.go.disabled = !screen.go;
}
