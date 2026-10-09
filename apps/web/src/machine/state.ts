export type BayCode = "1" | "3";

export type AccessRole = "guest" | "visitor" | "owner";

type ConsoleLayout = "sheet" | "column";

export type MachineState = {
  access: AccessRole;
  status: "idle" | "reading" | "granted" | "selected" | "denied" | "dispensing";
  selection: BayCode | null;
  tray: BayCode | null;
  busy: boolean;
  authStep: "closed" | "methods" | "otp-machine" | "oauth" | "issuing";
  authRequest: BayCode | null;
  screenTransfer: BayCode | null;
  authDigits: string;
  authAttemptsLeft: number | null;
  consoleLayout: ConsoleLayout;
  consoleOpen: boolean;
};

export type MachineEvent =
  | { type: "select"; bay: BayCode }
  | { type: "preselect"; bay: BayCode }
  | { type: "pass-tap" }
  | { type: "reader-scanned" }
  | { type: "otp-sent" }
  | { type: "oauth-started" }
  | { type: "verifying" }
  | { type: "pass-issued"; access: AccessRole }
  | { type: "pass-removed" }
  | { type: "otp-digits"; digits: string }
  | { type: "otp-rejected"; attemptsLeft: number }
  | { type: "console"; open: boolean }
  | { type: "console-layout"; layout: ConsoleLayout }
  | { type: "tray-ready" }
  | { type: "activate-tray" }
  | { type: "cancel" }
  | { type: "reset" };

export type MachineHost = {
  read: () => MachineState;
  dispatch: (event: MachineEvent) => MachineState;
};

export const POLICY: Record<BayCode, AccessRole[]> = {
  "1": ["visitor", "owner"],
  "3": ["guest", "visitor", "owner"],
};

export function permits(access: AccessRole, bay: BayCode): boolean {
  return POLICY[bay].includes(access);
}

export function initialState(access: AccessRole): MachineState {
  return {
    access,
    status: "idle",
    selection: null,
    tray: null,
    busy: false,
    authStep: "closed",
    authRequest: null,
    screenTransfer: null,
    authDigits: "",
    authAttemptsLeft: null,
    consoleLayout: "sheet",
    consoleOpen: false,
  };
}

export function reduce(state: MachineState, event: MachineEvent): MachineState {
  switch (event.type) {
    case "select": {
      if (state.busy) return state;
      if (permits(state.access, event.bay)) {
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

    case "pass-tap": {
      if (state.busy || state.access !== "guest") return state;
      return { ...state, status: "reading", busy: true };
    }

    case "reader-scanned": {
      if (state.authStep !== "closed" || state.status !== "reading")
        return state;
      return { ...state, status: "idle", authStep: "methods", busy: true };
    }

    case "otp-sent": {
      if (state.authStep !== "methods") return state;
      return { ...state, authStep: "otp-machine", busy: true };
    }

    case "oauth-started": {
      if (state.authStep !== "methods") return state;
      return { ...state, authStep: "oauth", busy: true };
    }

    case "verifying": {
      if (state.authStep !== "otp-machine" && state.authStep !== "oauth")
        return state;
      return { ...state, authStep: "issuing", busy: true };
    }

    case "pass-issued": {
      const access = event.access;
      if (state.authRequest && permits(access, state.authRequest)) {
        return {
          ...state,
          access,
          status: "dispensing",
          selection: state.authRequest,
          authRequest: null,
          busy: true,
          authStep: "closed",
          authDigits: "",
          authAttemptsLeft: null,
        };
      }
      return {
        ...state,
        access,
        status: state.authRequest ? "denied" : "granted",
        authRequest: null,
        busy: false,
        authStep: "closed",
        authDigits: "",
        authAttemptsLeft: null,
      };
    }

    case "pass-removed": {
      return {
        ...initialState("guest"),
        consoleLayout: state.consoleLayout,
        consoleOpen: state.consoleOpen,
      };
    }

    case "otp-digits": {
      return { ...state, authDigits: event.digits };
    }

    case "otp-rejected": {
      if (state.authStep !== "otp-machine") return state;
      return {
        ...state,
        authDigits: "",
        authAttemptsLeft: event.attemptsLeft,
      };
    }

    case "console": {
      if (state.consoleLayout !== "sheet") return state;
      return { ...state, consoleOpen: event.open };
    }

    case "console-layout": {
      return { ...state, consoleLayout: event.layout };
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
      return {
        ...state,
        screenTransfer: null,
        authStep: "closed",
        authDigits: "",
        authAttemptsLeft: null,
        busy: false,
      };
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
        authDigits: "",
        authAttemptsLeft: null,
      };
    }
  }
}
