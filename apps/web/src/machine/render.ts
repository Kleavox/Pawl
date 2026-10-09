import { permits } from "./state";
import type { AccessRole, BayCode, MachineState } from "./state";
import type { MachineModel } from "../estate-adapter";

const BAYS: readonly BayCode[] = ["1", "3"];
const OTP_LENGTH = 6;

const PRODUCT: Record<BayCode, string> = {
  "1": "LINK",
  "3": "PORT",
};

const TITLE: Record<BayCode, string> = {
  "1": "Link",
  "3": "Portfolio",
};

const CABINET_WORD: Record<AccessRole, string> = {
  guest: "GUEST MODE",
  visitor: "VISITOR MODE",
  owner: "OWNER MODE",
};

const PASS_WORD: Record<AccessRole, string> = {
  guest: "NONE",
  visitor: "VISITOR",
  owner: "OWNER",
};

type ScreenCopy = { main: string; sub: string };

function passWord(bay: BayCode): string {
  return permits("visitor", bay) ? "visitor" : "owner";
}

function denialReason(bay: BayCode): string {
  return `${passWord(bay).toUpperCase()} PASS REQUIRED`;
}

function cartridgeName(bay: BayCode, access: AccessRole): string {
  const state = permits(access, bay)
    ? "ready"
    : `${passWord(bay)} pass required`;
  return `Select ${TITLE[bay]}, bay ${bay}, ${state}`;
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
      sub: "TYPE THE CODE FROM YOUR EMAIL",
    };
  }
  if (state.authStep === "methods") {
    return { main: "CHOOSE A METHOD", sub: "THE TERMINAL IS OPEN" };
  }
  if (state.authStep === "oauth") {
    return { main: "OPENING PROVIDER", sub: "FINISH IN THE NEW PAGE" };
  }
  if (state.authStep === "issuing") {
    return { main: "CHECKING YOUR PASS", sub: "ONE MOMENT" };
  }
  if (state.status === "reading") {
    return { main: "READING PASS", sub: "HOLD THE CARD STILL" };
  }
  if (state.status === "denied") {
    if (state.selection === null) {
      return { main: "DENIED", sub: "A PASS IS REQUIRED" };
    }
    return {
      main: `${state.selection} DENIED, ${denialReason(state.selection)}`,
      sub: "TAP YOUR PASS TO UNLOCK IT",
    };
  }
  if (state.status === "dispensing" && state.selection !== null) {
    return {
      main: `${state.selection} RELEASING, ${PRODUCT[state.selection]}`,
      sub: "WAIT FOR THE DELIVERY BAY",
    };
  }
  if (state.tray !== null) {
    return {
      main: `${state.tray} DELIVERED, ${PRODUCT[state.tray]}`,
      sub: "TAKE IT FROM THE DELIVERY BAY",
    };
  }
  if (state.status === "selected" && state.selection !== null) {
    return {
      main: `${state.selection} SELECTED, ${PRODUCT[state.selection]}`,
      sub: "PRESS GO TO RELEASE IT",
    };
  }
  if (state.status === "granted") {
    return { main: "PASS ACCEPTED", sub: "SELECT A BAY" };
  }
  return {
    main: model.screen,
    sub: model.screen.includes("UNREADABLE")
      ? "PRESS GO TO RETRY"
      : "SELECT A BAY",
  };
}

function write(root: ParentNode, selector: string, value: string): void {
  const node = root.querySelector(selector);
  if (node !== null) node.textContent = value;
}

function outside(root: ParentNode, panel: HTMLElement): HTMLElement[] {
  const scrim = root.querySelector("[data-scrim]");
  const terminal = root.querySelector("[data-terminal]");
  const bridge = root.querySelector("[data-transfer]");
  const found: HTMLElement[] = [];
  let node: Element = panel;
  while (node.parentElement !== null) {
    const parent: HTMLElement = node.parentElement;
    for (const sibling of parent.children) {
      if (
        sibling === node ||
        sibling === scrim ||
        sibling === terminal ||
        sibling === bridge
      ) {
        continue;
      }
      if (sibling instanceof HTMLElement) found.push(sibling);
    }
    if (parent === parent.ownerDocument.body) break;
    node = parent;
  }
  return found;
}

function paintConsole(root: ParentNode, state: MachineState): void {
  const panel = root.querySelector<HTMLElement>("[data-console]");
  if (panel === null) return;
  const sheet = state.consoleLayout === "sheet";
  const open = !sheet || state.consoleOpen;

  panel.dataset.console = open ? "open" : "closed";
  panel.setAttribute("aria-hidden", String(!open));
  panel.toggleAttribute("inert", !open);
  root
    .querySelector("[data-dock]")
    ?.setAttribute("aria-expanded", String(open));

  if (sheet) {
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
  } else {
    panel.removeAttribute("role");
    panel.removeAttribute("aria-modal");
  }

  for (const node of outside(root, panel)) {
    node.toggleAttribute("inert", sheet && open);
  }
}

export function render(
  root: ParentNode,
  state: MachineState,
  model: MachineModel,
): void {
  const machine = root.querySelector<HTMLElement>("[data-machine]");
  if (machine !== null) {
    machine.dataset.access = state.access;
    machine.dataset.status = state.status;
    machine.dataset.input =
      state.authStep === "otp-machine" ? "otp" : "selector";
  }

  const cabinet = root.querySelector<HTMLElement>("[data-cabinet-state]");
  if (cabinet !== null) {
    cabinet.dataset.cabinetState = state.access;
    cabinet.textContent = CABINET_WORD[state.access];
  }

  const lit = new Map(model.items.map((item) => [item.code, item.lit]));
  for (const bay of BAYS) {
    const backlight = root.querySelector<HTMLElement>(
      `[data-bay="${bay}"] [data-backlight]`,
    );
    if (backlight !== null) {
      backlight.dataset.lit = String(lit.get(bay) === true);
    }
    root
      .querySelector(`[data-cartridge="${bay}"]`)
      ?.setAttribute("aria-label", cartridgeName(bay, state.access));
  }

  const copy = screenCopy(state, model);
  write(root, "[data-screen]", copy.main);
  write(root, "[data-screen-sub]", copy.sub);
  write(root, "[data-dock-screen]", copy.main);
  write(root, "[data-dock-sub]", copy.sub);

  const releasing = state.status === "dispensing" ? state.selection : null;
  const falling = root.querySelector<HTMLElement>("[data-falling]");
  if (falling !== null) falling.dataset.falling = releasing ?? "none";
  write(
    root,
    "[data-falling-name]",
    releasing === null ? "" : PRODUCT[releasing],
  );

  const tray = root.querySelector<HTMLElement>("[data-tray]");
  if (tray !== null) tray.dataset.tray = state.tray ?? "none";
  write(root, "[data-tray-code]", state.tray ?? "");
  write(
    root,
    "[data-tray-name]",
    state.tray === null ? "" : PRODUCT[state.tray],
  );

  const transfer = root.querySelector<HTMLElement>("[data-transfer]");
  if (transfer !== null) {
    transfer.dataset.transfer = state.screenTransfer ?? "none";
    if (transfer instanceof HTMLDialogElement) {
      const bridging = state.screenTransfer !== null;
      if (bridging && !transfer.open) transfer.showModal();
      if (!bridging && transfer.open) transfer.close();
    }
  }
  write(
    root,
    "[data-transfer-name]",
    state.screenTransfer === null ? "PAWL" : PRODUCT[state.screenTransfer],
  );

  write(root, "[data-terminal-access]", PASS_WORD[state.access]);
  write(
    root,
    "[data-terminal-state]",
    state.access === "guest" ? "SIGN IN" : "SIGNED IN",
  );

  paintConsole(root, state);
}
