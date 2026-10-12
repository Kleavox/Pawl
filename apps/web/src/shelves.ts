import { escapeHtml } from "@pawl/core";
import type { BayView } from "@pawl/registry";

const COUNT_WORD = ["no", "one", "two", "three"];

const COIL = `<span class="coil" aria-hidden="true"
                      ><i></i><i></i><i></i><i></i><i></i><i></i
                    ></span>`;

function twoDigits(code: string): string {
  return code.padStart(2, "0");
}

function led(bay: BayView): string {
  return bay.estate
    ? `<span class="rail__led" data-led data-severity="none">—</span>`
    : `<span class="rail__led" data-led data-severity="link">OPEN ↗</span>`;
}

function filledSlot(bay: BayView): string {
  const code = escapeHtml(bay.code);
  const product = escapeHtml(bay.product);
  const title = escapeHtml(bay.title);
  return `<div class="slot" data-bay="${code}" data-estate="${bay.estate}" data-access-needed="${escapeHtml(bay.access)}">
                    <span class="bay-backlight" data-backlight></span>
                    ${COIL}
                    <button
                      class="cartridge cartridge--${escapeHtml(bay.shape)}"
                      type="button"
                      data-cartridge="${code}"
                      data-href="${escapeHtml(bay.href)}"
                      aria-label="Select ${title}, bay ${code}"
                    >
                      <span class="cartridge__lug" aria-hidden="true"></span>
                      <span class="cartridge__sticker">
                        <span class="cartridge__name" style="--chars: ${bay.chars}">${product}</span>
                        <span class="cartridge__title">${title}</span>
                        <span class="cartridge__stripe" aria-hidden="true"></span>
                      </span>
                      <span class="cartridge__grip" aria-hidden="true"><i></i><i></i><i></i></span>
                    </button>
                    <span class="rail" data-rail>
                      <span class="rail__code">${twoDigits(code)}</span>
                      <span class="rail__label">${product}</span>
                      ${led(bay)}
                    </span>
                  </div>`;
}

function emptySlot(code: string): string {
  return `<div class="slot slot--empty" data-bay="${code}" aria-hidden="true">
                    ${COIL}
                    <span class="rail" data-rail>
                      <span class="rail__code">${twoDigits(code)}</span>
                      <span class="rail__label">—</span>
                    </span>
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
                  class="shelf"
                  data-shelf
                  role="group"
                  aria-label="${shelfLabel(first, filled)}"
                >
                  ${slots.join("\n\n                  ")}
                </div>`);
  }
  return shelves.join("\n\n                ");
}
