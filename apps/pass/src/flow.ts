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
  | "delete"
  | "registry"
  | "registry-name"
  | "registry-label"
  | "registry-return"
  | "registry-secret"
  | "registry-remove";

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
  resume: PassView | null;
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
  | { type: "signed-out" }
  | { type: "expired"; text: string };

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
  registry: "account",
  "registry-name": "registry",
  "registry-label": "registry-name",
  "registry-return": "registry-label",
  "registry-secret": "registry",
  "registry-remove": "registry",
};

export const SCREEN_NAME: Readonly<Record<PassView, string>> = {
  loading: "ONE MOMENT",
  methods: "SIGN IN",
  email: "EMAIL A CODE",
  code: "EMAIL A CODE",
  password: "PASSWORD",
  register: "CREATE ACCOUNT",
  "register-key": "CREATE ACCOUNT",
  sent: "CHECK YOUR INBOX",
  forgot: "RESET PASSWORD",
  welcome: "PASS ALMOST READY",
  "welcome-key": "PASS ALMOST READY",
  verify: "VERIFY EMAIL",
  reset: "NEW PASSWORD",
  link: "LINK PROVIDER",
  challenge: "HUMAN CHECK",
  account: "YOUR ACCOUNT",
  profile: "PROFILE",
  "profile-name": "CHANGE USERNAME",
  "profile-key": "SET A PASSWORD",
  devices: "DEVICES",
  apps: "APPS",
  security: "SECURITY",
  delete: "DELETE ACCOUNT",
  registry: "REGISTERED APPS",
  "registry-name": "NEW APP",
  "registry-label": "NEW APP",
  "registry-return": "NEW APP",
  "registry-secret": "COPY THE SECRET",
  "registry-remove": "REMOVE AN APP",
};

export const SCREEN_SUB: Readonly<Partial<Record<PassView, string>>> = {
  loading: "READING YOUR PASS",
  methods: "PICK A WAY IN",
  email: "GO SENDS THE CODE",
  code: "KEY IN THE CODE",
  password: "GO SIGNS YOU IN",
  register: "NAME AND EMAIL",
  "register-key": "CHOOSE A PASSWORD",
  sent: "LINK SENT",
  forgot: "GO SENDS A LINK",
  welcome: "PICK A USERNAME",
  "welcome-key": "OPTIONAL PASSWORD",
  verify: "CHECKING THE LINK",
  reset: "RE-KEYING ACCOUNT",
  link: "ONE MOMENT",
  challenge: "ONE MOMENT",
};

const BACK_TO: Readonly<Partial<Record<PassView, string>>> = {
  methods: "Sign-in options",
  email: "Email",
  password: "Password",
  register: "Name and email",
  welcome: "Username",
  account: "Account",
  profile: "Profile",
  security: "Security",
  registry: "Registered apps",
  "registry-name": "Name and address",
  "registry-label": "On the cabinet",
};

export function backLabel(view: PassView): string | null {
  const to = BACK[view];
  return to === undefined ? null : (BACK_TO[to] ?? null);
}

const SERIES: Readonly<Partial<Record<PassView, readonly [number, number]>>> = {
  email: [1, 2],
  code: [2, 2],
  register: [1, 2],
  "register-key": [2, 2],
  welcome: [1, 2],
  "welcome-key": [2, 2],
  "registry-name": [1, 3],
  "registry-label": [2, 3],
  "registry-return": [3, 3],
};

const SECTION_ORDER: readonly PassView[] = [
  "profile",
  "devices",
  "apps",
  "security",
  "registry",
];

export function stepOf(view: PassView, admin: boolean): string | null {
  const place = SECTION_ORDER.indexOf(view);
  if (place >= 0) return `${place + 1} OF ${admin ? 5 : 4}`;
  const series = SERIES[view];
  return series === undefined ? null : `${series[0]} OF ${series[1]}`;
}

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
  "registry",
  "registry-name",
  "registry-label",
  "registry-return",
  "registry-remove",
]);

const SECTIONS: ReadonlySet<PassView> = new Set([
  "profile",
  "devices",
  "apps",
  "security",
  "sent",
  "registry-secret",
]);

const RESUMABLE: ReadonlySet<PassView> = new Set<PassView>([
  "account",
  "profile",
  "profile-name",
  "profile-key",
  "devices",
  "apps",
  "security",
  "delete",
  "registry",
  "registry-name",
  "registry-label",
  "registry-return",
  "registry-remove",
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
    resume: null,
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
      if (event.needsUsername) return opened(state, "welcome");
      return { ...opened(state, state.resume ?? "account"), resume: null };
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
      return { ...opened(state, "methods"), email: "", resume: null };
    case "expired":
      return {
        ...opened(state, "methods"),
        email: "",
        resume: RESUMABLE.has(state.view) ? state.view : state.resume,
        say: { kind: "error", text: event.text },
      };
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
  sections = 4,
): ReadonlySet<string> {
  if (state.busy) return new Set();
  if (state.view === "methods") {
    return new Set(
      Array.from({ length: choices }, (_, index) => String(index + 1)),
    );
  }
  if (state.view === "account") {
    return new Set(
      Array.from({ length: sections }, (_, index) => String(index + 1)),
    );
  }
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
