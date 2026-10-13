import { escapeHtml } from "./escape.js";

export type MachineFraming = "whole" | "screen" | "printer";

export type MachineKey =
  | { kind: "link"; href: string }
  | { kind: "submit"; form: string; name?: string; value?: string }
  | { kind: "button" };

export type MachineKeypad =
  | { mode: "machine" }
  | {
      mode: "service";
      clr?: MachineKey;
      go?: MachineKey;
      caption?: string;
    };

export type MachineOptions = {
  siteName: string;
  rootOrigin: string;
  framing: MachineFraming;
  ticker: string;
  chip: { state: "guest" | "visitor" | "owner" | "service"; word: string };
  display: string;
  lcd: { main: string; sub: string };
  keypad: MachineKeypad;
  headingBrand?: boolean;
  sign?: string;
  sound?: boolean;
  tray?: string;
  machine?: Record<string, string>;
  main?: boolean;
  settled?: boolean;
};

export const CAMERA_HINT_SCRIPT = `try{let f={"#cam=screen":"screen","#cam=printer":"printer"}[decodeURIComponent(location.hash)];if(f)document.currentScript.parentNode.dataset.framing=f}catch{}`;

export const CAMERA_HINT_HASH =
  "'sha256-v+fTw6nFuQjYDTurFyJ7ctQTQsPPH4nSCRgMFDzjmWY='";

export const MACHINE_PARTS = [
  "marquee",
  "ticker",
  "chip",
  "bezel",
  "display",
  "lock",
  "speaker",
  "sensor",
  "lcd",
  "placard",
  "keypad",
  "lenses",
  "printer",
  "printer-slot",
  "tray",
  "plate",
] as const;

const SERIAL = "PAWL-GW-01";

const BRAILLE: Readonly<Record<string, string>> = {
  "1": "1",
  "2": "12",
  "3": "14",
  "4": "145",
  "5": "15",
  "6": "124",
  "7": "1245",
  "8": "125",
  "9": "24",
  "0": "245",
};

const ROWS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function braille(digit: string): string {
  return `<span class="pw-braille" data-braille="${BRAILLE[digit]}" aria-hidden="true"></span>`;
}

function machineKey(label: string): string {
  if (label === "CLR") {
    return `<button class="pw-key key key--fn" type="button" data-key="CLR">CLR</button>`;
  }
  if (label === "GO") {
    return `<button class="pw-key pw-key--go key key--go" type="button" data-key="GO">GO</button>`;
  }
  return `<button class="pw-key key" type="button" data-key="${label}">${label}${braille(label)}</button>`;
}

function unlit(label: string): string {
  const cell = label in BRAILLE ? braille(label) : "";
  return `<span class="pw-key is-unlit" aria-hidden="true">${label}${cell}</span>`;
}

function serviceKey(
  label: "CLR" | "GO",
  key: MachineKey | undefined,
  described: boolean,
): string {
  if (key === undefined) return unlit(label);
  const tone =
    label === "GO" ? "pw-key pw-key--go key key--go" : "pw-key key key--fn";
  const about = described ? ' aria-describedby="keys-caption"' : "";
  if (key.kind === "link") {
    return `<a class="${tone}" href="${escapeHtml(key.href)}"${about}>${label}</a>`;
  }
  if (key.kind === "submit") {
    const name =
      key.name === undefined ? "" : ` name="${escapeHtml(key.name)}"`;
    const value =
      key.value === undefined ? "" : ` value="${escapeHtml(key.value)}"`;
    return `<button class="${tone}" type="submit" form="${escapeHtml(key.form)}"${name}${value}${about}>${label}</button>`;
  }
  return `<button class="${tone}" type="button" data-key="${label}"${about}>${label}</button>`;
}

function keypad(options: MachineKeypad): string {
  const lamps = `<span class="keypad__mode" aria-hidden="true"><span class="mode-lamp" data-keypad-mode="selector"><i></i>Select</span><span class="mode-lamp" data-keypad-mode="otp"><i></i>Code</span></span>`;
  if (options.mode === "machine") {
    const keys = [...ROWS, "CLR", "0", "GO"].map(machineKey).join("");
    return `<div class="keypad" data-part="keypad" role="group" aria-label="Bay selector and email code keypad">${lamps}${keys}</div>`;
  }
  const described = options.caption !== undefined;
  const keys = [
    ...ROWS.map(unlit),
    serviceKey("CLR", options.clr, described),
    unlit("0"),
    serviceKey("GO", options.go, described),
  ].join("");
  const top = described
    ? `<p class="keypad__mode keypad__caption" id="keys-caption">${escapeHtml(options.caption ?? "")}</p>`
    : `<span class="keypad__mode" aria-hidden="true"><span class="mode-lamp is-on"><i></i>Service</span></span>`;
  return `<div class="keypad keypad--service" data-part="keypad" role="group" aria-label="Keypad">${top}${keys}</div>`;
}

function attributes(extra: Record<string, string> | undefined): string {
  if (extra === undefined) return "";
  return Object.entries(extra)
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join("");
}

function plate(options: MachineOptions): string {
  const root = escapeHtml(options.rootOrigin);
  const sound = options.sound
    ? `<button class="sound-switch" type="button" data-sound aria-pressed="false"><span class="sound-switch__track" aria-hidden="true"><i></i></span><span class="sound-switch__label">Sound</span></button>`
    : "";
  const inert = options.framing === "screen" ? " inert" : "";
  return `<div class="plate" data-part="plate"${inert}><span class="plate__rivets" aria-hidden="true"><i></i><i></i></span><span class="plate__serial">${SERIAL}</span>${sound}<span class="plate__links"><a href="${root}/privacy.html">Privacy</a><span aria-hidden="true">·</span><a href="${root}/terms.html">Terms</a></span><span class="plate__copy">© ${new Date().getFullYear()} ${escapeHtml(options.siteName)}</span></div>`;
}

export function renderMachine(options: MachineOptions): string {
  const brandTag = options.headingBrand ? "h1" : "p";
  const brand = escapeHtml(options.siteName.toUpperCase());
  const sign = options.sign
    ? `<span class="bezel__sign" aria-hidden="true">${escapeHtml(options.sign)}</span>`
    : "";
  const label = `${escapeHtml(options.siteName)} vending machine`;
  const main = options.main ?? true;
  const open = main
    ? `<main class="room" aria-label="${label}">`
    : `<div class="room" role="region" aria-label="${label}">`;
  const hint = options.settled ? "" : `<script>${CAMERA_HINT_SCRIPT}</script>`;
  return `${open}<div class="camera" data-camera data-framing="${options.framing}">${hint}<div class="machine" data-machine${attributes(options.machine)}><div class="marquee" data-part="marquee"><span class="marquee__bolt" aria-hidden="true"></span><${brandTag} class="marquee__brand">${brand}</${brandTag}><div class="marquee__ticker" data-part="ticker" aria-hidden="true"><span class="marquee__ticker-text" data-ticker-text>${escapeHtml(options.ticker)}</span></div><span class="marquee__chip" data-part="chip" data-cabinet-state="${options.chip.state}"><span class="marquee__lamp" aria-hidden="true"></span><span data-cabinet-word>${escapeHtml(options.chip.word)}</span></span><span class="marquee__bolt" aria-hidden="true"></span></div><div class="machine__body"><section class="bezel" data-part="bezel" aria-label="Screen"><span class="screw screw--tl" aria-hidden="true"></span><span class="screw screw--tr" aria-hidden="true"></span><span class="screw screw--bl" aria-hidden="true"></span><span class="screw screw--br" aria-hidden="true"></span><div class="display" data-part="display">${options.display}<span class="display__glare" aria-hidden="true"></span></div>${sign}<span class="machine__lock" data-part="lock" aria-hidden="true"><i></i></span></section><section class="strip" aria-label="Service panel"><div class="strip__top" aria-hidden="true"><span class="strip__speaker" data-part="speaker"></span><span class="strip__sensor" data-part="sensor"></span></div><div class="lcd" data-part="lcd"><p class="lcd__line" role="status" aria-live="polite" aria-atomic="true"><span class="lcd__main" data-screen>${escapeHtml(options.lcd.main)}</span><small class="lcd__sub" data-screen-sub>${escapeHtml(options.lcd.sub)}</small></p></div><ol class="placard" data-part="placard" aria-hidden="true"><li><span class="placard__n">1</span><span class="placard__text">Pick<br>a bay</span></li><li><span class="placard__n">2</span><span class="placard__text">Sign<br>in</span></li><li><span class="placard__n">3</span><span class="placard__text">Take<br>it</span></li></ol>${keypad(options.keypad)}<div class="lenses" data-part="lenses" aria-hidden="true"><span class="lens"><span class="led led--ready" data-led-state="ready"></span>Ready</span><span class="lens"><span class="led led--busy" data-led-state="busy"></span>Busy</span><span class="lens"><span class="led led--denied" data-led-state="denied"></span>Denied</span></div><div class="printer" data-part="printer" aria-hidden="true"><span class="printer__slot" data-part="printer-slot"><i class="printer__led"></i></span><span class="printer__label">Receipts</span></div></section></div><div class="machine__base"><div class="tray" data-part="tray"><span class="tray__flap" aria-hidden="true"><span class="tray__push">PUSH</span></span><span class="tray__label" aria-hidden="true">DELIVERY BAY</span>${options.tray ?? ""}</div>${plate(options)}</div><span class="machine__feet" aria-hidden="true"><i></i><i></i></span></div></div>${main ? "</main>" : "</div>"}`;
}
