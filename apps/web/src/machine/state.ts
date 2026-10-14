import type { BayView } from "@pawl/registry";

export type BayCode = string;

export type Catalog = BayView[];

export type AccessRole = "guest" | "visitor" | "owner";

export type MachineState = {
  access: AccessRole;
  status: "idle" | "granted" | "selected" | "denied" | "dispensing";
  selection: BayCode | null;
  tray: BayCode | null;
  busy: boolean;
  authStep: "closed" | "leaving" | "account";
  authRequest: BayCode | null;
  screenTransfer: BayCode | null;
  catalog: Catalog;
};

export type MachineEvent =
  | { type: "select"; bay: BayCode }
  | { type: "preselect"; bay: BayCode }
  | { type: "sign-in" }
  | { type: "stay" }
  | { type: "open-account" }
  | { type: "pass-issued"; access: AccessRole }
  | { type: "pass-removed" }
  | { type: "tray-ready" }
  | { type: "activate-tray" }
  | { type: "cancel" }
  | { type: "back" }
  | { type: "reset" };

export type MachineHost = {
  read: () => MachineState;
  dispatch: (event: MachineEvent) => MachineState;
};

const ALLOWED: Record<BayView["access"], AccessRole[]> = {
  public: ["guest", "visitor", "owner"],
  visitor: ["visitor", "owner"],
  owner: ["owner"],
};

export function permits(
  access: AccessRole,
  bay: BayCode,
  catalog: Catalog,
): boolean {
  const entry = catalog.find((candidate) => candidate.code === bay);
  return entry !== undefined && ALLOWED[entry.access].includes(access);
}

export function initialState(
  access: AccessRole,
  catalog: Catalog,
): MachineState {
  return {
    access,
    status: "idle",
    selection: null,
    tray: null,
    busy: false,
    authStep: "closed",
    authRequest: null,
    screenTransfer: null,
    catalog,
  };
}

export function reduce(state: MachineState, event: MachineEvent): MachineState {
  switch (event.type) {
    case "select": {
      if (state.busy) return state;
      if (permits(state.access, event.bay, state.catalog)) {
        return {
          ...state,
          selection: event.bay,
          status: "dispensing",
          busy: true,
          authRequest: null,
        };
      }
      return {
        ...state,
        selection: event.bay,
        status: "denied",
        busy: false,
        authRequest: state.access === "guest" ? event.bay : null,
      };
    }

    case "preselect": {
      if (state.busy) return state;
      return { ...state, selection: event.bay, status: "selected" };
    }

    case "sign-in": {
      if (state.busy || state.access !== "guest") return state;
      if (state.authStep !== "closed") return state;
      return { ...state, status: "idle", authStep: "leaving", busy: true };
    }

    case "stay": {
      if (state.authStep !== "leaving") return state;
      return { ...state, authStep: "closed", busy: false };
    }

    case "open-account": {
      if (state.busy || state.access === "guest") return state;
      if (state.authStep !== "closed") return state;
      return { ...state, authStep: "account" };
    }

    case "pass-issued": {
      const access = event.access;
      if (
        state.authRequest &&
        permits(access, state.authRequest, state.catalog)
      ) {
        return {
          ...state,
          access,
          status: "dispensing",
          selection: state.authRequest,
          authRequest: null,
          busy: true,
          authStep: "closed",
        };
      }
      return {
        ...state,
        access,
        status: state.authRequest ? "denied" : "granted",
        authRequest: null,
        busy: false,
        authStep: "closed",
      };
    }

    case "pass-removed": {
      return initialState("guest", state.catalog);
    }

    case "tray-ready": {
      return {
        ...state,
        tray: state.selection,
        selection: null,
        status: "idle",
        busy: false,
      };
    }

    case "activate-tray": {
      if (!state.tray || state.busy) return state;
      return { ...state, screenTransfer: state.tray, busy: true };
    }

    case "cancel": {
      if (state.status === "dispensing" || state.authStep === "leaving")
        return state;
      const putBack = state.status === "selected" || state.status === "denied";
      return {
        ...state,
        selection: putBack ? null : state.selection,
        status: putBack ? "idle" : state.status,
        authRequest: state.status === "denied" ? null : state.authRequest,
        screenTransfer: null,
        authStep: "closed",
        busy: false,
      };
    }

    case "back": {
      if (state.authStep === "account") return { ...state, authStep: "closed" };
      return state;
    }

    case "reset": {
      return {
        ...state,
        status: "idle",
        selection: null,
        tray: null,
        busy: false,
        authStep: "closed",
        screenTransfer: null,
      };
    }
  }
}
