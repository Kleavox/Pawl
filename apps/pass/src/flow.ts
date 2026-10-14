import type { Mode } from "./types";

export type PassView =
  | "loading"
  | "methods"
  | "email"
  | "code"
  | "password"
  | "register"
  | "register-key"
  | "sent"
  | "forgot"
  | "welcome"
  | "welcome-key"
  | "verify"
  | "reset"
  | "link"
  | "challenge"
  | "account"
  | "profile"
  | "profile-name"
  | "profile-key"
  | "devices"
  | "apps"
  | "security"
  | "delete";

export type Method = "google" | "github" | "email" | "password";

type Say = { kind: "error" | "success" | "info"; text: string } | null;

export type PassState = {
  view: PassView;
  email: string;
  digits: string;
  attemptsLeft: number | null;
  page: number;
  busy: boolean;
  say: Say;
};

export type Route =
  "/" | "/verify" | "/reset" | "/challenge" | "/link-oauth" | "/welcome";

export type PassEvent =
  | {
      type: "arrived";
      route: Route;
      signedIn: boolean;
      needsUsername: boolean;
      mode?: "register" | "forgot";
    }
  | { type: "open"; view: PassView }
  | { type: "code-sent"; email: string }
  | { type: "digit"; digit: string }
  | { type: "erase" }
  | { type: "code-rejected"; attemptsLeft: number }
  | { type: "code-locked"; text: string }
  | { type: "signed-in"; needsUsername: boolean }
  | { type: "done"; text: string }
  | { type: "page"; step: 1 | -1; total: number }
  | { type: "busy"; busy: boolean }
  | { type: "say"; say: Say }
  | { type: "back" }
  | { type: "signed-out" };

export const CODE_LENGTH = 6;

export const BACK: Readonly<Partial<Record<PassView, PassView>>> = {
  email: "methods",
  code: "email",
  password: "methods",
  register: "methods",
  "register-key": "register",
  forgot: "password",
  sent: "methods",
  "welcome-key": "welcome",
  profile: "account",
  devices: "account",
  apps: "account",
  security: "account",
  "profile-name": "profile",
  "profile-key": "profile",
  delete: "security",
};

const FORMS: ReadonlySet<PassView> = new Set([
  "email",
  "password",
  "register",
  "register-key",
  "forgot",
  "welcome",
  "welcome-key",
  "reset",
  "profile-name",
  "profile-key",
  "delete",
]);

const SECTIONS: ReadonlySet<PassView> = new Set([
  "profile",
  "devices",
  "apps",
  "security",
  "sent",
]);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function initialFlow(): PassState {
  return {
    view: "loading",
    email: "",
    digits: "",
    attemptsLeft: null,
    page: 0,
    busy: false,
    say: null,
  };
}

function opened(state: PassState, view: PassView): PassState {
  return {
    ...state,
    view,
    digits: "",
    attemptsLeft: null,
    page: 0,
    busy: false,
    say: null,
  };
}

function landing(signedIn: boolean, needsUsername: boolean): PassView {
  if (!signedIn) return "methods";
  return needsUsername ? "welcome" : "account";
}

const ROUTED: Partial<Record<Route, PassView>> = {
  "/verify": "verify",
  "/reset": "reset",
  "/challenge": "challenge",
  "/link-oauth": "link",
};

export function reduceFlow(state: PassState, event: PassEvent): PassState {
  switch (event.type) {
    case "arrived": {
      const routed = ROUTED[event.route];
      if (routed !== undefined) return opened(state, routed);
      if (!event.signedIn && event.mode !== undefined) {
        return opened(state, event.mode);
      }
      return opened(state, landing(event.signedIn, event.needsUsername));
    }
    case "open":
      return opened(state, event.view);
    case "code-sent":
      return { ...opened(state, "code"), email: event.email };
    case "digit": {
      if (state.view !== "code" || state.busy) return state;
      if (state.digits.length >= CODE_LENGTH) return state;
      if (!DIGITS.includes(event.digit)) return state;
      return { ...state, digits: state.digits + event.digit, say: null };
    }
    case "erase": {
      if (state.view !== "code" || state.busy) return state;
      if (state.digits === "")
        return { ...opened(state, "email"), email: state.email };
      return { ...state, digits: state.digits.slice(0, -1) };
    }
    case "code-rejected":
      return {
        ...state,
        digits: "",
        attemptsLeft: event.attemptsLeft,
        busy: false,
      };
    case "code-locked":
      return {
        ...opened(state, "email"),
        email: state.email,
        say: { kind: "error", text: event.text },
      };
    case "signed-in":
      return opened(state, event.needsUsername ? "welcome" : "account");
    case "done":
      return {
        ...opened(state, "sent"),
        say: { kind: "success", text: event.text },
      };
    case "page": {
      const last = Math.max(0, event.total - 1);
      return {
        ...state,
        page: Math.min(
          last,
          Math.max(0, Math.min(state.page, last) + event.step),
        ),
      };
    }
    case "busy":
      return { ...state, busy: event.busy };
    case "say":
      return { ...state, say: event.say };
    case "back": {
      const to = BACK[state.view];
      if (to === undefined || state.busy) return state;
      return { ...opened(state, to), email: state.email };
    }
    case "signed-out":
      return { ...opened(state, "methods"), email: "" };
  }
}

export function methodChoices(providers: {
  google: boolean;
  github: boolean;
}): { key: string; method: Method }[] {
  const methods: Method[] = [
    ...(providers.google ? (["google"] as const) : []),
    ...(providers.github ? (["github"] as const) : []),
    "email",
    "password",
  ];
  return methods.map((method, index) => ({ key: String(index + 1), method }));
}

export function passKeys(
  state: PassState,
  choices: number,
): ReadonlySet<string> {
  if (state.busy) return new Set();
  if (state.view === "methods") {
    return new Set(
      Array.from({ length: choices }, (_, index) => String(index + 1)),
    );
  }
  if (state.view === "account") return new Set(["1", "2", "3", "4"]);
  if (state.view === "code") {
    return new Set(
      state.digits.length < CODE_LENGTH ? [...DIGITS, "CLR"] : ["CLR", "GO"],
    );
  }
  const lit = new Set<string>();
  if (BACK[state.view] !== undefined) lit.add("CLR");
  if (FORMS.has(state.view)) lit.add("GO");
  if (SECTIONS.has(state.view) && !lit.has("CLR")) return new Set();
  return lit;
}

export function pageOf<T>(
  items: readonly T[],
  page: number,
  size = 3,
): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const at = Math.min(Math.max(0, page), pages - 1);
  return { rows: items.slice(at * size, at * size + size), page: at, pages };
}

const MODES: readonly Mode[] = ["login", "register", "forgot"];

export function initialMode(search: string): Mode {
  const wanted = new URLSearchParams(search).get("mode");
  return MODES.find((mode) => mode === wanted) ?? "login";
}
