import { escapeHtml } from "@pawl/core";
import type { BayView } from "@pawl/registry";

const SCOPE: Record<BayView["access"], string> = {
  public: "Public",
  visitor: "Visitor",
  owner: "Owner",
};

const COUNT_WORD = ["no", "one", "two", "three"];

const COIL = `<span class="coil"
                      ><i></i><i></i><i></i><i></i><i></i
                    ></span>`;

function filledSlot(bay: BayView): string {
  const code = escapeHtml(bay.code);
  const product = escapeHtml(bay.product);
  return `<div class="slot" data-bay="${code}">
                    <span class="bay-backlight" data-backlight></span>
                    ${COIL}
                    <button
                      class="cartridge cartridge--${escapeHtml(bay.shape)}"
                      type="button"
                      data-cartridge="${code}"
                      data-href="${escapeHtml(bay.href)}"
                      aria-label="Select ${escapeHtml(bay.title)}, bay ${code}"
                    >
                      <span class="cartridge__detail"></span>
                      <span class="cartridge__name" style="--chars: ${bay.chars}">${product}</span>
                    </button>
                    <span class="slot-code">
                      <span>${code} &middot; <strong>${product}</strong></span>
                      <span class="slot-code__scope">${SCOPE[bay.access]}</span>
                    </span>
                  </div>`;
}

function emptySlot(code: string): string {
  return `<div class="slot slot--empty" data-bay="${code}" aria-hidden="true">
                    ${COIL}
                    <span class="empty-stop"></span>
                    <span class="slot-code">${code} &middot; EMPTY</span>
                  </div>`;
}

function shelfLabel(first: number, filled: number): string {
  const range = `Bays ${first} to ${first + 2}`;
  if (filled === 0) return `${range}, three empty bays`;
  return `${range}, ${COUNT_WORD[filled]} application${filled === 1 ? "" : "s"}`;
}

export function renderShelves(bays: BayView[]): string {
  const byCode = new Map(bays.map((bay) => [bay.code, bay]));
  const shelves: string[] = [];
  for (const first of [1, 4, 7]) {
    const codes = [first, first + 1, first + 2].map(String);
    const filled = codes.filter((code) => byCode.has(code)).length;
    const slots = codes.map((code) => {
      const bay = byCode.get(code);
      return bay ? filledSlot(bay) : emptySlot(code);
    });
    shelves.push(`<div
                  class="${first === 1 ? "shelf shelf--primary" : "shelf"}"
                  data-shelf
                  role="group"
                  aria-label="${shelfLabel(first, filled)}"
                >
                  ${slots.join("\n\n                  ")}
                </div>`);
  }
  return shelves.join("\n\n                ");
}
