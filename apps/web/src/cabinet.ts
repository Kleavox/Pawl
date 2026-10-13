import { renderMachine } from "@pawl/core";
import type { BayView } from "@pawl/registry";

import { renderScreens } from "./screens";
import { renderTiles } from "./tiles";

export type CabinetInput = {
  siteName: string;
  rootOrigin: string;
  passHref: string;
  bays: BayView[];
  ticker: string;
};

const TRAY = `<span class="falling-cartridge" data-falling="none" aria-hidden="true"><span class="falling-cartridge__sticker"><strong data-falling-name></strong></span></span><div class="tray__result" data-tray="none"><span class="tray-item" aria-hidden="true"><strong data-tray-code></strong><small data-tray-name></small></span><button class="tray-action" type="button" data-tray-action>TAKE DELIVERY</button></div>`;

export type ReceiptInput = {
  siteName: string;
  rootOrigin: string;
  title: string;
};

const RECEIPT_SCREEN = `<div class="screen"><section class="view view--form" aria-label="Printer"><div class="view__bar"><span class="view__where">RECEIPT</span><span class="view__step">PRINTED</span></div><div class="view__body view__body--center"><p class="view__eyebrow">Printed</p><p class="view__title">Your receipt is below</p><p class="view__note">Tear it off when you are done.</p></div><div class="view__foot"><p class="view__hint" aria-hidden="true">Tear it off at the slot</p></div></section></div>`;

export function renderReceiptMachine(input: ReceiptInput): string {
  return renderMachine({
    siteName: input.siteName,
    rootOrigin: "",
    framing: "printer",
    ticker: "RECEIPT PRINTED · KEEP IT FOR YOUR RECORDS",
    chip: { state: "service", word: "PRINTER" },
    display: RECEIPT_SCREEN,
    lcd: { main: "RECEIPT PRINTED", sub: input.title.toUpperCase() },
    keypad: { mode: "service" },
    sound: true,
    main: false,
    machine: { "data-status": "idle", "data-view": "receipt" },
  });
}

export function renderCabinet(input: CabinetInput): string {
  const back = encodeURIComponent(input.rootOrigin);
  return renderMachine({
    siteName: input.siteName,
    rootOrigin: "",
    framing: "whole",
    ticker: input.ticker,
    chip: { state: "guest", word: "GUEST MODE" },
    display: renderScreens({
      siteName: input.siteName,
      passHref: input.passHref,
      passSignIn: `${input.passHref}/?returnTo=${back}`,
      passHost: new URL(input.passHref).host,
      tiles: renderTiles(input.bays),
    }),
    lcd: { main: "PICK A BAY", sub: "OR SIGN IN ON SCREEN" },
    keypad: { mode: "machine" },
    headingBrand: true,
    sound: true,
    tray: TRAY,
    machine: {
      "data-access": "guest",
      "data-status": "idle",
      "data-input": "selector",
      "data-view": "products",
      "data-busy": "false",
    },
  });
}
