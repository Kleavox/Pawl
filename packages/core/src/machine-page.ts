import { escapeHtml } from "./escape.js";

export type MachineKey =
  | { kind: "link"; href: string }
  | { kind: "submit"; form: string; name: string; value: string };

export interface MachinePageOptions {
  title: string;
  status: string;
  sub?: string;
  body: string;
  keys?: { clr?: MachineKey; go?: MachineKey };
  caption?: string;
  sign?: string;
  siteName?: string;
  rootOrigin?: string;
}

const MONO = `"Cascadia Mono","SF Mono","JetBrains Mono","Roboto Mono",Consolas,monospace`;
const DISPLAY = `"Bahnschrift","DIN Alternate","DIN Condensed","Roboto Condensed","Arial Narrow",sans-serif`;
const UI = `"Segoe UI Variable Text","Segoe UI","SF Pro Text",-apple-system,"Inter",system-ui,sans-serif`;
const STEEL =
  "linear-gradient(160deg,#e3e8ee 0%,#c9d0d8 38%,#a9b2bd 72%,#8e98a4 100%)";

export const MACHINE_PAGE_CSS = [
  "*,*::before,*::after{box-sizing:border-box}",
  `body{margin:0;min-height:100dvh;color:#e9eef4;font-family:${UI};line-height:1.5;-webkit-font-smoothing:antialiased;background:radial-gradient(90% 55% at 50% 0%,#17233a 0%,transparent 70%),linear-gradient(180deg,#0a0f17 0%,#0d131d 100%)}`,
  "a{color:inherit}",
  ":focus-visible{outline:2px solid #2f6bff;outline-offset:2px}",
  ".room{min-height:100dvh;display:grid;justify-items:center;align-content:start;padding:clamp(16px,4vh,44px) 12px 48px}",
  `.machine{width:min(100%,780px);display:grid;gap:12px;padding:12px;border:1px solid #5c6672;border-radius:18px 18px 10px 10px;background:${STEEL};box-shadow:0 34px 70px rgb(0 0 0/55%),inset 0 1px 0 rgb(255 255 255/45%)}`,
  ".marquee{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:58px;padding:8px 16px;border:1px solid #5c6672;border-radius:10px;background:linear-gradient(180deg,#0a1730,#070c15)}",
  `.brand{color:#ffffff;font-family:${DISPLAY};font-size:1.75rem;font-weight:700;letter-spacing:.32em;text-decoration:none;text-shadow:0 0 10px #2f6bff,0 0 26px rgb(47 107 255/35%)}`,
  `.chip{display:inline-flex;align-items:center;gap:8px;min-height:30px;padding:0 12px;border:1px solid #2c3d5c;border-radius:4px;background:#000000;color:#9cc2ff;font:700 .75rem/1 ${MONO};letter-spacing:.12em}`,
  ".chip i{width:8px;height:8px;border-radius:50%;background:#ffb020;box-shadow:0 0 8px #ffb020}",
  `.panel{display:grid;grid-template-columns:minmax(0,1fr) 200px;gap:14px;padding:14px;border:1px solid #5c6672;border-radius:10px;background:${STEEL};box-shadow:inset 0 1px 0 rgb(255 255 255/45%)}`,
  ".bezel{padding:10px;border-radius:10px;background:linear-gradient(180deg,#3c4552,#1a2230);box-shadow:inset 0 1px 0 rgb(255 255 255/12%)}",
  ".screen{position:relative;display:flex;flex-direction:column;height:560px;overflow:hidden;border:2px solid #000000;border-radius:6px;background:radial-gradient(120% 70% at 50% 0%,#0a1730 0%,#06101f 70%);box-shadow:inset 0 0 22px rgb(47 107 255/22%)}",
  `.status{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;margin:0;padding:10px 16px;border-bottom:1px solid #1f2d45;color:#9cc2ff;font:700 .75rem/1.4 ${MONO};letter-spacing:.08em;text-transform:uppercase}`,
  ".status small{color:#8fa0b4;font-size:.6875rem}",
  ".view{display:flex;flex:1;flex-direction:column;gap:12px;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-color:#2f6bff transparent;scrollbar-width:thin;padding:24px}",
  `.eyebrow{margin:0;color:#9cc2ff;font:700 .75rem/1 ${MONO};letter-spacing:.16em;text-transform:uppercase}`,
  ".eyebrow--danger{color:#ff4d5e}",
  "h1{margin:0;color:#e9eef4;font-size:1.625rem;font-weight:650;line-height:1.15}",
  "p{margin:0;color:#8fa0b4}",
  "strong{color:#e9eef4;font-weight:600}",
  `.led{color:#9cc2ff;font:800 clamp(3rem,12vw,5rem)/1 ${MONO};letter-spacing:.08em;text-shadow:0 0 18px #2f6bff}`,
  ".scopes{display:grid;gap:8px;margin:0;padding:0;list-style:none}",
  ".scopes li{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #1f2d45;border-radius:6px;background:rgb(10 23 48/70%);color:#e9eef4}",
  `.scopes li::before{content:"\\2713";display:grid;place-items:center;flex:none;width:18px;height:18px;border-radius:4px;background:#2f6bff;color:#ffffff;font:700 .75rem/1 ${UI}}`,
  ".actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:auto}",
  ".button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:1px solid #2c3d5c;border-radius:6px;background:#0a1730;color:#e9eef4;font-family:inherit;font-size:1rem;font-weight:600;text-decoration:none;cursor:pointer}",
  ".button:hover{border-color:#5b8cff}",
  ".button--primary{border-color:#2f6bff;background:#2f6bff;color:#ffffff;box-shadow:0 0 18px rgb(47 107 255/35%)}",
  ".controls{display:flex;flex-direction:column;gap:12px}",
  ".keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px;border-radius:10px;background:linear-gradient(180deg,#a9b2bd,#8e98a4);box-shadow:inset 0 2px 5px rgb(0 0 0/30%)}",
  `.mode,.caption{grid-column:1/-1;margin:0;color:#1a2230;font:700 .6875rem/1.4 ${MONO};letter-spacing:.14em;text-align:center}`,
  `.key{display:grid;place-items:center;min-height:44px;padding:0;border:1px solid #8e98a4;border-radius:6px;background:linear-gradient(180deg,#ffffff,#e4e8ee 60%);box-shadow:0 3px 0 #8e98a4,inset 0 1px 0 #ffffff;color:#1a2230;font:700 1rem/1 ${MONO};text-decoration:none;cursor:pointer}`,
  ".key:active{transform:translateY(2px);box-shadow:0 1px 0 #8e98a4}",
  ".key--go{border-color:#1f4fd1;background:linear-gradient(180deg,#5b8cff,#2f6bff);box-shadow:0 3px 0 #1f4fd1,0 0 16px rgb(47 107 255/35%);color:#ffffff}",
  ".key.is-unlit{opacity:.4;box-shadow:0 2px 0 #8e98a4;cursor:default}",
  `.dock{display:grid;place-items:center;min-height:96px;border:1px solid #5c6672;border-radius:10px;background:linear-gradient(180deg,#3c4552,#1b2330);color:#5b6a7e;font:700 .6875rem/1 ${MONO};letter-spacing:.14em}`,
  ".slot{height:14px;margin:0 8%;border-radius:7px;background:linear-gradient(180deg,#000000,#1b2330);box-shadow:inset 0 2px 4px rgb(0 0 0/70%)}",
  `.plate{display:grid;gap:6px;padding:12px 16px;border:1px solid #5c6672;border-radius:4px;background:linear-gradient(180deg,#a9b2bd,#8e98a4);color:#1a2230;font:700 .6875rem/1.4 ${MONO};letter-spacing:.14em;text-align:center}`,
  `.plate b{font-family:${DISPLAY};font-size:.875rem;letter-spacing:.24em}`,
  ".plate nav{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px}",
  `.sign{position:absolute;z-index:2;top:64px;left:50%;padding:12px 22px;border:3px solid #1a2230;border-radius:4px;background:#ffb020;color:#1a2230;font:800 1.25rem/1 ${MONO};letter-spacing:.14em;white-space:nowrap;box-shadow:0 10px 18px rgb(0 0 0/50%);transform:translateX(-50%) rotate(-4deg)}`,
  '.sign::before,.sign::after{content:"";position:absolute;bottom:100%;width:2px;height:52px;background:#a9b2bd}',
  ".sign::before{left:18%;transform:rotate(24deg);transform-origin:bottom}",
  ".sign::after{right:18%;transform:rotate(-24deg);transform-origin:bottom}",
  ".has-sign .view{padding-top:132px}",
  "@media (max-width:700px){.panel{grid-template-columns:minmax(0,1fr)}.brand{font-size:1.375rem}.actions{grid-template-columns:minmax(0,1fr)}}",
  "@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}",
].join("\n");

function keyHtml(
  label: "CLR" | "GO",
  key: MachineKey | undefined,
  described: boolean,
): string {
  const tone = label === "GO" ? "key key--go" : "key";
  const about = described ? ' aria-describedby="keys-caption"' : "";
  if (key === undefined) {
    return `<span class="key is-unlit" aria-hidden="true">${label}</span>`;
  }
  if (key.kind === "link") {
    return `<a class="${tone}" href="${escapeHtml(key.href)}"${about}>${label}</a>`;
  }
  return `<button class="${tone}" type="submit" form="${escapeHtml(key.form)}" name="${escapeHtml(key.name)}" value="${escapeHtml(key.value)}"${about}>${label}</button>`;
}

function digits(): string {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
    .map(
      (digit) =>
        `<span class="key is-unlit" aria-hidden="true">${digit}</span>`,
    )
    .join("");
}

export function renderMachinePage(options: MachinePageOptions): string {
  const site = escapeHtml(options.siteName ?? "Pawl");
  const root = escapeHtml(options.rootOrigin ?? "");
  const sub = options.sub ? `<small>${escapeHtml(options.sub)}</small>` : "";
  const sign = options.sign
    ? `<span class="sign" aria-hidden="true">${escapeHtml(options.sign)}</span>`
    : "";
  const caption = options.caption
    ? `<p class="caption" id="keys-caption">${escapeHtml(options.caption)}</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0a0f17">
<title>${escapeHtml(options.title)}</title>
<style>${MACHINE_PAGE_CSS}</style>
</head>
<body>
<main class="room" aria-label="${site} service panel">
<div class="machine">
<div class="marquee"><a class="brand" href="${root}/">${escapeHtml((options.siteName ?? "Pawl").toUpperCase())}</a><span class="chip"><i aria-hidden="true"></i>SERVICE MODE</span></div>
<section class="panel" aria-label="Service panel">
<div class="bezel"><div class="screen${options.sign ? " has-sign" : ""}">
<p class="status" role="status"><span>${escapeHtml(options.status)}</span>${sub}</p>
${sign}
<div class="view">${options.body}</div>
</div></div>
<div class="controls">
<div class="keypad" role="group" aria-label="Keypad"><p class="mode">SERVICE KEYS</p>${digits()}${keyHtml("CLR", options.keys?.clr, Boolean(options.caption))}<span class="key is-unlit" aria-hidden="true">0</span>${keyHtml("GO", options.keys?.go, Boolean(options.caption))}${caption}</div>
<div class="dock" aria-hidden="true">PASS DOCK</div>
<div class="slot" aria-hidden="true"></div>
</div>
</section>
<div class="plate"><b>PAWL-GW-01</b><nav aria-label="Receipts"><a href="${root}/">Machine</a><a href="${root}/privacy.html">Privacy</a><a href="${root}/terms.html">Terms</a></nav><span>&copy; ${new Date().getFullYear()} ${site}</span></div>
</div>
</main>
</body>
</html>`;
}
