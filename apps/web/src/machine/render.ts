import type { Indicator } from "@pawl/ui";

import { permits } from "./state";
import type { AccessRole, BayCode, Catalog, MachineState } from "./state";
import type { MachineModel } from "../estate-adapter";

const OTP_LENGTH = 6;

export type ScreenView =
  "products" | "signin" | "email" | "code" | "working" | "account";

function entryOf(catalog: Catalog, bay: BayCode) {
  return catalog.find((entry) => entry.code === bay);
}

function productOf(catalog: Catalog, bay: BayCode): string {
  return entryOf(catalog, bay)?.product ?? "";
}

function shapeOf(catalog: Catalog, bay: BayCode | null): string {
  return bay === null ? "none" : (entryOf(catalog, bay)?.shape ?? "none");
}

const CABINET_WORD: Record<AccessRole, string> = {
  guest: "GUEST MODE",
  visitor: "VISITOR MODE",
  owner: "OWNER MODE",
};

const PASS_KIND: Record<AccessRole, string> = {
  guest: "",
  visitor: "VISITOR PASS",
  owner: "OWNER PASS",
};

const ROLE_LINE: Record<AccessRole, string> = {
  guest: "",
  visitor: "Visitor pass: public and visitor bays are open to you.",
  owner: "Owner pass: every bay is open to you.",
};

type ScreenCopy = { main: string; sub: string };

export function viewFor(state: MachineState): ScreenView {
  if (state.authStep === "methods") return "signin";
  if (state.authStep === "email") return "email";
  if (state.authStep === "otp-machine") return "code";
  if (state.authStep === "oauth" || state.authStep === "issuing") {
    return "working";
  }
  if (state.authStep === "account") return "account";
  return "products";
}

function passWord(catalog: Catalog, bay: BayCode): string {
  return permits("visitor", bay, catalog) ? "visitor" : "owner";
}

function denialReason(catalog: Catalog, bay: BayCode): string {
  return `${passWord(catalog, bay).toUpperCase()} PASS REQUIRED`;
}

function cartridgeName(
  catalog: Catalog,
  bay: BayCode,
  access: AccessRole,
): string {
  const state = permits(access, bay, catalog)
    ? "ready"
    : `${passWord(catalog, bay)} pass required`;
  return `Select ${entryOf(catalog, bay)?.title ?? bay}, bay ${bay}, ${state}`;
}

function triesLeft(left: number): string {
  return left === 1 ? "1 TRY LEFT" : `${left} TRIES LEFT`;
}

function screenCopy(state: MachineState, model: MachineModel): ScreenCopy {
  if (state.authStep === "otp-machine") {
    if (state.authAttemptsLeft !== null && state.authDigits === "") {
      return {
        main: "CODE REJECTED",
        sub: triesLeft(state.authAttemptsLeft),
      };
    }
    return {
      main: `EMAIL CODE ${state.authDigits.length}/${OTP_LENGTH}`,
      sub: "CODE FROM YOUR EMAIL",
    };
  }
  if (state.authStep === "methods") {
    return { main: "CHOOSE A METHOD", sub: "PRESS 1, 2 OR 3" };
  }
  if (state.authStep === "email") {
    return { main: "ENTER YOUR EMAIL", sub: "GO SENDS THE CODE" };
  }
  if (state.authStep === "oauth") {
    return { main: "OPENING PROVIDER", sub: "FINISH IN THE NEW PAGE" };
  }
  if (state.authStep === "issuing") {
    return { main: "CHECKING YOUR PASS", sub: "ONE MOMENT" };
  }
  if (state.authStep === "account") {
    return { main: "YOUR ACCOUNT", sub: "MANAGE OR SIGN OUT" };
  }
  if (state.status === "denied") {
    const sub =
      state.access === "guest" ? "SIGN IN TO UNLOCK" : "FOR THE OWNER ONLY";
    if (state.selection === null) return { main: "DENIED", sub };
    return {
      main: `${state.selection} DENIED, ${denialReason(state.catalog, state.selection)}`,
      sub,
    };
  }
  if (state.status === "dispensing" && state.selection !== null) {
    return {
      main: `${state.selection} RELEASING, ${productOf(state.catalog, state.selection)}`,
      sub: "WAIT FOR THE DELIVERY BAY",
    };
  }
  if (state.tray !== null) {
    return {
      main: `${state.tray} DELIVERED, ${productOf(state.catalog, state.tray)}`,
      sub: "OPEN THE FLAP BELOW",
    };
  }
  if (state.status === "selected" && state.selection !== null) {
    return {
      main: `${state.selection} SELECTED, ${productOf(state.catalog, state.selection)}`,
      sub: "PRESS GO TO RELEASE IT",
    };
  }
  if (state.status === "granted") {
    return { main: "SIGNED IN", sub: "SELECT A BAY" };
  }
  if (model.screen.includes("UNREADABLE")) {
    return { main: model.screen, sub: "PRESS GO TO RETRY" };
  }
  return {
    main: model.screen,
    sub: state.access === "guest" ? "OR SIGN IN ON SCREEN" : "SELECT A BAY",
  };
}

type Badge = { text: string; severity: string };

function badgeFor(
  state: MachineState,
  bay: Catalog[number],
  indicators: Record<string, Indicator> | null,
): Badge {
  if (!permits(state.access, bay.code, state.catalog)) {
    return {
      text: state.access === "guest" ? "SIGN IN" : "OWNER",
      severity: "locked",
    };
  }
  if (!bay.estate) return { text: "OPEN ↗", severity: "link" };
  if (indicators === null) return { text: "—", severity: "none" };
  const indicator = indicators[bay.key];
  if (indicator === undefined || indicator === "unknown") {
    return { text: "--", severity: "unknown" };
  }
  if (indicator === "locked") return { text: "LOCKED", severity: "locked" };
  return {
    text: String(indicator.count),
    severity: indicator.severity ?? "ok",
  };
}

const TILE_STATE: Partial<Record<MachineState["status"], string>> = {
  selected: "selected",
  dispensing: "releasing",
  denied: "denied",
};

function write(root: ParentNode, selector: string, value: string): void {
  const node = root.querySelector(selector);
  if (node !== null && node.textContent !== value) node.textContent = value;
}

function paintViews(root: ParentNode, view: ScreenView): void {
  for (const panel of root.querySelectorAll<HTMLElement>("[data-view-panel]")) {
    panel.hidden = panel.dataset.viewPanel !== view;
  }
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function litKeys(
  state: MachineState,
  screen: string,
  faulted: boolean,
): ReadonlySet<string> {
  const view = viewFor(state);
  if (view === "working") return new Set();
  if (view === "signin") return new Set(["1", "2", "3", "CLR"]);
  if (view === "account") return new Set(["CLR"]);
  if (view === "email") return new Set(["CLR", "GO"]);
  if (view === "code") {
    return new Set(
      state.authDigits.length < OTP_LENGTH ? [...DIGITS, "CLR"] : ["CLR", "GO"],
    );
  }
  if (state.busy) return new Set();
  const lit = new Set(state.catalog.map((bay) => bay.code));
  const pending = state.status === "selected";
  if (pending || state.status === "denied" || faulted) lit.add("CLR");
  if (pending || screen.includes("UNREADABLE")) lit.add("GO");
  return lit;
}

function paintKeys(root: ParentNode, lit: ReadonlySet<string>): void {
  for (const key of root.querySelectorAll<HTMLElement>("[data-key]")) {
    const off = String(!lit.has(key.dataset.key ?? ""));
    if (key.getAttribute("aria-disabled") !== off) {
      key.setAttribute("aria-disabled", off);
    }
  }
}

export function say(
  root: ParentNode,
  state: MachineState,
  message: string,
): void {
  const view = viewFor(state);
  for (const line of root.querySelectorAll<HTMLElement>("[data-say]")) {
    const words = line.closest(`[data-view-panel="${view}"]`) ? message : "";
    if (line.textContent !== words) line.textContent = words;
  }
}

function paintCode(root: ParentNode, digits: string): void {
  const cells = root.querySelectorAll<HTMLElement>("[data-code-cell]");
  cells.forEach((cell, index) => {
    const digit = digits[index] ?? "";
    if (cell.textContent !== digit) cell.textContent = digit;
    cell.dataset.filled = String(digit !== "");
  });
}

export function render(
  root: ParentNode,
  state: MachineState,
  model: MachineModel,
  faulted = false,
): void {
  const view = viewFor(state);
  const machine = root.querySelector<HTMLElement>("[data-machine]");
  if (machine !== null) {
    machine.dataset.access = state.access;
    machine.dataset.status = state.status;
    machine.dataset.input =
      state.authStep === "otp-machine" ? "otp" : "selector";
    machine.dataset.view = view;
    machine.dataset.busy = String(
      state.status === "dispensing" ||
        state.authStep === "issuing" ||
        state.screenTransfer !== null,
    );
  }
  paintViews(root, view);
  paintKeys(root, litKeys(state, model.screen, faulted));

  const cabinet = root.querySelector<HTMLElement>("[data-cabinet-state]");
  if (cabinet !== null) {
    cabinet.dataset.cabinetState = state.access;
    const word = cabinet.querySelector("[data-cabinet-word]") ?? cabinet;
    if (word.textContent !== CABINET_WORD[state.access]) {
      word.textContent = CABINET_WORD[state.access];
    }
  }
  write(root, "[data-ticker-text]", model.ticker);

  const lit = new Map(model.items.map((item) => [item.code, item.lit]));
  const marked = TILE_STATE[state.status];
  for (const bay of state.catalog) {
    const tile = root.querySelector<HTMLElement>(`[data-tile="${bay.code}"]`);
    if (tile === null) continue;
    tile.dataset.state =
      marked !== undefined && state.selection === bay.code ? marked : "idle";
    tile.dataset.lit = String(lit.get(bay.code) === true);
    tile.dataset.locked = permits(state.access, bay.code, state.catalog)
      ? ""
      : state.access === "guest"
        ? "guest"
        : "owner";
    tile
      .querySelector("[data-cartridge]")
      ?.setAttribute(
        "aria-label",
        cartridgeName(state.catalog, bay.code, state.access),
      );
    const node = tile.querySelector<HTMLElement>("[data-badge]");
    if (node !== null) {
      const badge = badgeFor(state, bay, model.indicators);
      if (node.textContent !== badge.text) node.textContent = badge.text;
      node.dataset.severity = badge.severity;
    }
  }

  const copy = screenCopy(state, model);
  write(root, "[data-screen]", copy.main);
  write(root, "[data-screen-sub]", copy.sub);

  const guest = state.access === "guest";
  write(
    root,
    "[data-greeting]",
    guest
      ? "PICK A BAY"
      : `HI, ${(model.holder ?? "").toUpperCase()} · ${state.access.toUpperCase()}`,
  );
  for (const opener of root.querySelectorAll<HTMLElement>(
    "[data-terminal-open]",
  )) {
    opener.hidden = !guest;
  }
  for (const opener of root.querySelectorAll<HTMLElement>(
    "[data-account-open]",
  )) {
    opener.hidden = guest;
  }
  write(root, "[data-account-pass]", PASS_KIND[state.access]);
  write(root, "[data-account-name]", model.holder ?? "");
  write(root, "[data-account-email]", model.email ?? "");
  write(root, "[data-account-role]", ROLE_LINE[state.access]);
  write(
    root,
    "[data-sign-in-for]",
    state.authRequest === null
      ? ""
      : `${productOf(state.catalog, state.authRequest)} needs a pass`,
  );
  paintCode(root, state.authDigits);
  write(
    root,
    "[data-code-tries]",
    state.authAttemptsLeft === null
      ? ""
      : `That code was not right. ${triesLeft(state.authAttemptsLeft).toLowerCase()}.`,
  );

  const releasing = state.status === "dispensing" ? state.selection : null;
  const falling = root.querySelector<HTMLElement>("[data-falling]");
  if (falling !== null) {
    falling.dataset.falling = releasing ?? "none";
    falling.dataset.fallingShape = shapeOf(state.catalog, releasing);
  }
  write(
    root,
    "[data-falling-name]",
    releasing === null ? "" : productOf(state.catalog, releasing),
  );

  const tray = root.querySelector<HTMLElement>("[data-tray]");
  if (tray !== null) {
    tray.dataset.tray = state.tray ?? "none";
    tray.dataset.trayShape = shapeOf(state.catalog, state.tray);
  }
  write(root, "[data-tray-code]", state.tray ?? "");
  write(
    root,
    "[data-tray-name]",
    state.tray === null ? "" : productOf(state.catalog, state.tray),
  );

  const transfer = root.querySelector<HTMLElement>("[data-transfer]");
  if (transfer !== null) {
    transfer.dataset.transfer = state.screenTransfer ?? "none";
    transfer.dataset.transferShape = shapeOf(
      state.catalog,
      state.screenTransfer,
    );
    if (transfer instanceof HTMLDialogElement) {
      const bridging = state.screenTransfer !== null;
      if (bridging && !transfer.open) transfer.showModal();
      if (!bridging && transfer.open) transfer.close();
    }
  }
  write(
    root,
    "[data-transfer-name]",
    state.screenTransfer === null
      ? "PAWL"
      : productOf(state.catalog, state.screenTransfer),
  );
}
