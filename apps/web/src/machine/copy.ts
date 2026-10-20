import type { Indicator } from "@pawl/ui";

import type { MachineModel } from "../estate-adapter";
import { permits } from "./state";
import type { AccessRole, BayCode, Catalog, MachineState } from "./state";

export type ScreenView = "products" | "working" | "account";

export type ScreenCopy = { main: string; sub: string };

type Badge = { text: string; severity: string };

export type TileView = {
  state: "idle" | "selected" | "releasing" | "denied";
  lit: boolean;
  locked: "" | "guest" | "owner";
  label: string;
  badge: Badge;
};

function entryOf(catalog: Catalog, bay: BayCode) {
  return catalog.find((entry) => entry.code === bay);
}

export function productOf(catalog: Catalog, bay: BayCode | null): string {
  return bay === null ? "" : (entryOf(catalog, bay)?.product ?? "");
}

export function shapeOf(catalog: Catalog, bay: BayCode | null): string {
  return bay === null ? "none" : (entryOf(catalog, bay)?.shape ?? "none");
}

export const CABINET_WORD: Record<AccessRole, string> = {
  guest: "GUEST MODE",
  visitor: "VISITOR MODE",
  owner: "OWNER MODE",
};

export const PASS_KIND: Record<AccessRole, string> = {
  guest: "",
  visitor: "VISITOR PASS",
  owner: "OWNER PASS",
};

export const ROLE_LINE: Record<AccessRole, string> = {
  guest: "",
  visitor: "Visitor pass: public and visitor bays are open to you.",
  owner: "Owner pass: every bay is open to you.",
};

export function viewFor(state: MachineState): ScreenView {
  if (state.authStep === "leaving") return "working";
  if (state.authStep === "account") return "account";
  return "products";
}

function passWord(catalog: Catalog, bay: BayCode): string {
  return permits("visitor", bay, catalog) ? "visitor" : "owner";
}

function denialReason(catalog: Catalog, bay: BayCode): string {
  return `${passWord(catalog, bay).toUpperCase()} PASS REQUIRED`;
}

function cartridgeLabel(
  catalog: Catalog,
  bay: BayCode,
  access: AccessRole,
): string {
  const state = permits(access, bay, catalog)
    ? "ready"
    : `${passWord(catalog, bay)} pass required`;
  return `Select ${entryOf(catalog, bay)?.title ?? bay}, bay ${bay}, ${state}`;
}

export function screenCopy(
  state: MachineState,
  model: MachineModel,
): ScreenCopy {
  if (state.authStep === "leaving") {
    return { main: "OPENING SIGN-IN", sub: "ONE MOMENT" };
  }
  if (state.authStep === "account") {
    return { main: "YOUR ACCOUNT", sub: "MANAGE OR SIGN OUT" };
  }
  if (state.receipt !== null) {
    return {
      main: "RECEIPT PRINTED",
      sub: `${state.receipt} ${productOf(state.catalog, state.receipt)}`,
    };
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

const TILE_STATE: Partial<
  Record<MachineState["status"], "selected" | "releasing" | "denied">
> = {
  selected: "selected",
  dispensing: "releasing",
  denied: "denied",
};

export function tileFor(
  state: MachineState,
  model: MachineModel,
  bay: Catalog[number],
): TileView {
  const marked = TILE_STATE[state.status];
  return {
    state:
      marked !== undefined && state.selection === bay.code ? marked : "idle",
    lit: model.items.some((item) => item.code === bay.code && item.lit),
    locked: permits(state.access, bay.code, state.catalog)
      ? ""
      : state.access === "guest"
        ? "guest"
        : "owner",
    label: cartridgeLabel(state.catalog, bay.code, state.access),
    badge: badgeFor(state, bay, model.indicators),
  };
}

export function greeting(state: MachineState, model: MachineModel): string {
  return state.access === "guest"
    ? "PICK A BAY"
    : `HI, ${(model.holder ?? "").toUpperCase()} · ${state.access.toUpperCase()}`;
}

export function machineAttributes(
  state: MachineState,
): Record<`data-${string}`, string> {
  return {
    "data-access": state.access,
    "data-status": state.status,
    "data-view": viewFor(state),
    "data-busy": String(
      state.status === "dispensing" ||
        state.authStep === "leaving" ||
        state.receipt !== null,
    ),
  };
}

export function litKeys(
  state: MachineState,
  screen: string,
  faulted: boolean,
): ReadonlySet<string> {
  const view = viewFor(state);
  if (view === "working") return new Set();
  if (view === "account") return new Set(["CLR"]);
  if (state.receipt !== null) return new Set();
  if (state.busy) return new Set();
  const lit = new Set(state.catalog.map((bay) => bay.code));
  const pending = state.status === "selected";
  if (pending || state.status === "denied" || faulted) lit.add("CLR");
  if (pending || screen.includes("UNREADABLE")) lit.add("GO");
  return lit;
}
