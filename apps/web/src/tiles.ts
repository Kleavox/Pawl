import { escapeHtml } from "@pawl/core";
import type { BayView } from "@pawl/registry";

const CODES = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function twoDigits(code: string): string {
  return code.padStart(2, "0");
}

function stocked(bay: BayView): string {
  const code = escapeHtml(bay.code);
  const badge = bay.estate
    ? `<span class="tile__badge" data-badge data-severity="none">—</span>`
    : `<span class="tile__badge" data-badge data-severity="link">OPEN ↗</span>`;
  return `<div class="tile" data-tile="${code}" data-state="idle" data-lit="false" data-locked=""><button class="tile__button" type="button" data-cartridge="${code}" data-href="${escapeHtml(bay.href)}" aria-label="Select ${escapeHtml(bay.title)}, bay ${code}"><span class="tile__code">${twoDigits(code)}</span><span class="tile__lock" aria-hidden="true"></span><span class="tile__art tile__art--${escapeHtml(bay.shape)}" aria-hidden="true"><i></i></span><span class="tile__name">${escapeHtml(bay.product)}</span>${badge}</button></div>`;
}

function empty(code: string): string {
  return `<div class="tile tile--empty" data-tile="${code}" aria-hidden="true"><span class="tile__code">${twoDigits(code)}</span><span class="tile__name">—</span></div>`;
}

export function renderTiles(bays: BayView[]): string {
  const byCode = new Map(bays.map((bay) => [bay.code, bay]));
  return `<div class="tiles" role="group" aria-label="Bays">${CODES.map(
    (code) => {
      const bay = byCode.get(code);
      return bay ? stocked(bay) : empty(code);
    },
  ).join("")}</div>`;
}
