import { escapeHtml } from "./escape.js";
import { MACHINE_CSS } from "./machine-css.js";
import { renderMachine, type MachineKey } from "./machine.js";

export interface MachinePageOptions {
  title: string;
  status: string;
  sub?: string;
  body: string;
  where?: string;
  keys?: { clr?: MachineKey; go?: MachineKey };
  caption?: string;
  sign?: string;
  siteName?: string;
  rootOrigin?: string;
}

const U = (n: number): string => `calc(${n} * var(--u))`;

export const MACHINE_PAGE_CSS = [
  "body{margin:0}",
  `.page-screen{position:absolute;inset:0;display:grid;grid-template-rows:${U(38)} minmax(0,1fr) ${U(34)};color:var(--pw-ink);font-family:var(--pw-ui)}`,
  `.page-bar{display:flex;align-items:center;justify-content:space-between;gap:${U(12)};min-width:0;padding:0 ${U(10)} 0 ${U(16)};border-bottom:${U(1)} solid var(--pw-screen-line);color:var(--pw-ice);font:700 ${U(14)}/1 var(--pw-mono);letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}`,
  ".page-bar span{min-width:0;overflow:hidden;text-overflow:ellipsis}",
  `.page-bar a{flex:none;display:inline-flex;align-items:center;height:${U(30)};padding:0 ${U(12)};border:${U(1)} solid var(--pw-cobalt);border-radius:${U(4)};background:var(--pw-cobalt-wash);color:var(--pw-ice);text-decoration:none}`,
  ".page-bar a:hover,.page-bar a:focus-visible{background:var(--pw-cobalt);color:var(--pw-white);outline:none}",
  `.page-view{display:flex;flex-direction:column;gap:${U(12)};min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:${U(24)} ${U(32)};scrollbar-color:var(--pw-cobalt) transparent;scrollbar-width:thin;font-size:${U(16)};line-height:1.5}`,
  ".page-view>*{flex-shrink:0}",
  `.bezel:has(.bezel__sign) .page-view{padding-top:${U(116)}}`,
  `.page-foot{display:grid;place-items:center;border-top:${U(1)} solid var(--pw-screen-line);color:var(--pw-ink-dim);font:600 ${U(14)}/1 var(--pw-mono);letter-spacing:.08em;text-transform:uppercase}`,
  `.eyebrow{margin:0;color:var(--pw-ice);font:700 ${U(14)}/1 var(--pw-mono);letter-spacing:.16em;text-transform:uppercase}`,
  ".eyebrow--danger{color:var(--pw-danger)}",
  `.page-view h1{margin:0;color:var(--pw-white);font-family:var(--pw-display);font-size:${U(26)};font-weight:700;line-height:1.15}`,
  ".page-view p{margin:0;color:var(--pw-ink-dim)}",
  ".page-view strong{color:var(--pw-ink);font-weight:600}",
  `.page-led{color:var(--pw-ice);font:800 ${U(64)}/1 var(--pw-mono);letter-spacing:.08em;text-shadow:0 0 ${U(18)} var(--pw-cobalt)}`,
  `.scopes{display:grid;gap:${U(8)};margin:0;padding:0;list-style:none}`,
  `.scopes li{display:flex;gap:${U(10)};align-items:flex-start;padding:${U(10)} ${U(12)};border:${U(1)} solid var(--pw-screen-line);border-radius:${U(6)};background:var(--pw-screen-hi);color:var(--pw-ink)}`,
  `.scopes li::before{content:"\\2713";display:grid;place-items:center;flex:none;width:${U(20)};height:${U(20)};border-radius:${U(4)};background:var(--pw-cobalt);color:var(--pw-white);font:700 ${U(14)}/1 var(--pw-ui)}`,
  `.actions{display:grid;grid-template-columns:1fr 1fr;gap:${U(10)};margin-top:auto}`,
  `.button{display:inline-flex;align-items:center;justify-content:center;min-height:${U(56)};padding:0 ${U(18)};border:${U(1)} solid var(--pw-screen-edge);border-radius:${U(8)};background:var(--pw-screen-hi);color:var(--pw-ink);font:700 ${U(16)}/1 var(--pw-ui);text-decoration:none;cursor:pointer}`,
  ".button:hover{border-color:var(--pw-cobalt-hi)}",
  `.button:focus-visible{outline:${U(2)} solid var(--pw-cobalt-hi);outline-offset:${U(2)}}`,
  `.button--primary{border-color:var(--pw-cobalt);background:var(--pw-cobalt);box-shadow:0 0 ${U(14)} var(--pw-cobalt-glow);color:var(--pw-white)}`,
  `@media (max-width:899px){.page-view{padding:${U(16)};font-size:${U(15)}}.page-view h1{font-size:${U(21)}}.actions{grid-template-columns:minmax(0,1fr)}.page-led{font-size:${U(48)}}}`,
].join("\n");

export function renderMachinePage(options: MachinePageOptions): string {
  const siteName = options.siteName ?? "Pawl";
  const root = options.rootOrigin ?? "";
  const foot = options.caption ? escapeHtml(options.caption) : "";
  const display = `<div class="page-screen"><div class="page-bar"><span>${escapeHtml(options.where ?? options.status)}</span><a href="${escapeHtml(root)}/#cam=screen">‹ Machine</a></div><div class="page-view">${options.body}</div><div class="page-foot" aria-hidden="true">${foot}</div></div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0a0f17">
<title>${escapeHtml(options.title)}</title>
<style>${MACHINE_CSS}
${MACHINE_PAGE_CSS}</style>
</head>
<body>
${renderMachine({
  siteName,
  rootOrigin: root,
  framing: "screen",
  ticker: options.status,
  chip: { state: "service", word: "SERVICE MODE" },
  display,
  lcd: { main: options.status, sub: options.sub ?? "" },
  keypad: {
    mode: "service",
    clr: options.keys?.clr,
    go: options.keys?.go,
    caption: options.caption,
  },
  headingBrand: false,
  sign: options.sign,
  settled: true,
  machine: { "data-view": "service" },
})}
</body>
</html>`;
}
