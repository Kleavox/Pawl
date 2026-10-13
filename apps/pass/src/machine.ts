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
