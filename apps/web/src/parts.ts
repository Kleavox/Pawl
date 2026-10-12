import { escapeHtml } from "@pawl/core";

const SERIAL = "PAWL-GW-01";

export function renderMarquee(
  siteName: string,
  ticker: string,
  heading = true,
): string {
  const tag = heading ? "h1" : "p";
  return `<div class="pw-marquee marquee">
        <span class="marquee__bolt marquee__bolt--left pw-rivet" aria-hidden="true"></span>
        <${tag} class="pw-marquee__brand marquee__brand">${escapeHtml(siteName.toUpperCase())}</${tag}>
        <div class="pw-marquee__ticker marquee__ticker" aria-hidden="true">
          <span class="pw-marquee__ticker-text" data-ticker-text>${escapeHtml(ticker)}</span>
        </div>
        <span class="pw-chip marquee__chip" data-cabinet-state="guest"><span class="pw-chip__lamp" aria-hidden="true"></span><span data-cabinet-word>GUEST MODE</span></span>
        <span class="marquee__bolt marquee__bolt--right pw-rivet" aria-hidden="true"></span>
      </div>`;
}

export function renderPlate(
  siteName: string,
  year: string,
  receiptsOrigin = "",
): string {
  const site = escapeHtml(siteName);
  const origin = escapeHtml(receiptsOrigin);
  return `<div class="pw-plate plate">
          <span class="plate__rivets" aria-hidden="true"><span class="pw-rivet"></span><span class="pw-rivet"></span></span>
          <span class="pw-plate__serial">${SERIAL}</span>
          <span class="pw-plate__links">
            <a href="${origin}/privacy.html">Privacy</a>
            <span class="pw-plate__dot" aria-hidden="true">·</span>
            <a href="${origin}/terms.html">Terms</a>
            <span class="pw-plate__dot" aria-hidden="true">·</span>
            <span>© ${escapeHtml(year)} ${site}</span>
          </span>
          <button class="sound-switch" type="button" data-sound aria-pressed="false">
            <span class="sound-switch__track" aria-hidden="true"><i></i></span>
            <span>Sound</span>
          </button>
        </div>`;
}
