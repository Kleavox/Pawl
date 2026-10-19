import type { Identity } from "@pawl/core";
import {
  Machine,
  Screen,
  useCameraArrival,
  useFollowFocus,
  useMachineKeys,
  useScanWipe,
} from "@pawl/ui";
import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";

import { departTo } from "./depart";
import {
  CODE_LENGTH,
  initialFlow,
  initialMode,
  methodChoices,
  passKeys,
  reduceFlow,
  type PassState,
  type PassView,
  type Route,
} from "./flow";
import { api, returnTo } from "./helpers";
import type { OAuthProviders, SessionResponse } from "./types";
import {
  handleOf,
  PASS_ENDED,
  PassContext,
  SCREEN_FORM,
  whoOf,
  type Draft,
  type Pass,
} from "./views/context";
import { sectionsFor } from "./views/Account";
import { choose } from "./views/Methods";
import { Screens } from "./views/Screens";

const STATUS: Record<PassView, { main: string; sub: string }> = {
  loading: { main: "ONE MOMENT", sub: "CHECKING YOUR PASS" },
  methods: { main: "SIGN IN", sub: "PASS REQUIRED" },
  email: { main: "ENTER YOUR EMAIL", sub: "GO SENDS THE CODE" },
  code: { main: "EMAIL CODE", sub: "CODE FROM YOUR EMAIL" },
  password: { main: "SIGN IN", sub: "PASSWORD" },
  register: { main: "CREATE ACCOUNT", sub: "NEW PASS" },
  "register-key": { main: "CREATE ACCOUNT", sub: "CHOOSE A PASSWORD" },
  sent: { main: "CHECK YOUR INBOX", sub: "LINK SENT" },
  forgot: { main: "RESET ACCESS", sub: "LOST KEY" },
  welcome: { main: "PASS ALMOST READY", sub: "PICK A USERNAME" },
  "welcome-key": { main: "PASS ALMOST READY", sub: "OPTIONAL PASSWORD" },
  verify: { main: "VERIFY EMAIL", sub: "CHECKING THE LINK" },
  reset: { main: "NEW PASSWORD", sub: "RE-KEYING THE ACCOUNT" },
  link: { main: "LINK PROVIDER", sub: "ONE MOMENT" },
  challenge: { main: "HUMAN CHECK", sub: "ONE MOMENT" },
  account: { main: "YOUR ACCOUNT", sub: "PASS ACCEPTED" },
  profile: { main: "ACCOUNT · PROFILE", sub: "PASS ACCEPTED" },
  "profile-name": { main: "CHANGE USERNAME", sub: "PASS ACCEPTED" },
  "profile-key": { main: "SET A PASSWORD", sub: "PASS ACCEPTED" },
  devices: { main: "ACCOUNT · DEVICES", sub: "PASS ACCEPTED" },
  apps: { main: "ACCOUNT · APPS", sub: "PASS ACCEPTED" },
  security: { main: "ACCOUNT SECURITY", sub: "PASS ACCEPTED" },
  delete: { main: "ACCOUNT · DELETE", sub: "PASS ACCEPTED" },
  registry: { main: "REGISTERED APPS", sub: "PASS ACCEPTED" },
  "registry-name": { main: "NEW APP · 1 OF 3", sub: "PASS ACCEPTED" },
  "registry-label": { main: "NEW APP · 2 OF 3", sub: "PASS ACCEPTED" },
  "registry-return": { main: "NEW APP · 3 OF 3", sub: "PASS ACCEPTED" },
  "registry-secret": { main: "COPY THE SECRET", sub: "PASS ACCEPTED" },
  "registry-remove": { main: "REMOVE AN APP", sub: "PASS ACCEPTED" },
};

const ROUTES: readonly Route[] = [
  "/",
  "/verify",
  "/reset",
  "/challenge",
  "/link-oauth",
  "/welcome",
];

function lcdFor(
  state: PassState,
  user: Identity | null,
): {
  main: string;
  sub: string;
} {
  const who = whoOf(user);
  const status =
    state.view !== "code"
      ? STATUS[state.view].main
      : state.attemptsLeft !== null && state.digits === ""
        ? "CODE REJECTED"
        : `EMAIL CODE ${state.digits.length}/${CODE_LENGTH}`;
  const sub =
    state.view === "code" && state.attemptsLeft !== null && state.digits === ""
      ? state.attemptsLeft === 1
        ? "1 TRY LEFT"
        : `${state.attemptsLeft} TRIES LEFT`
      : STATUS[state.view].sub;
  return {
    main: status,
    sub:
      who === "guest" ? sub : `${handleOf(user)} · ${who.toUpperCase()} PASS`,
  };
}

export function PassPage(props: {
  siteName: string;
  rootOrigin: string;
  initial?: Partial<PassState>;
  user?: Identity | null;
  providers?: OAuthProviders;
}): ReactNode {
  const [state, dispatch] = useReducer(
    reduceFlow,
    props.initial,
    (initial: Partial<PassState> | undefined) => ({
      ...initialFlow(),
      ...initial,
    }),
  );
  const [providers, setProviders] = useState<OAuthProviders>(
    props.providers ?? { google: false, github: false },
  );
  const [user, setUser] = useState<Identity | null>(props.user ?? null);
  const [draft, setDraft] = useState<Draft>({ username: "", email: "" });
  const camera = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const focusBack = useRef<HTMLElement | null>(null);
  const seeded = useRef(props.initial !== undefined);

  const pass: Pass = {
    state,
    dispatch,
    siteName: props.siteName,
    rootOrigin: props.rootOrigin,
    providers,
    user,
    setUser,
    draft,
    setDraft,
  };

  useEffect(() => {
    if (seeded.current) return;
    const path = window.location.pathname;
    const route = ROUTES.find((each) => each === path) ?? "/";
    if (route !== "/" && route !== "/welcome") {
      dispatch({
        type: "arrived",
        route,
        signedIn: false,
        needsUsername: false,
      });
      return;
    }
    const mode = initialMode(window.location.search);
    void Promise.all([
      api<SessionResponse>("/api/session"),
      api<OAuthProviders>("/api/oauth/providers"),
    ])
      .then(([session, offered]) => {
        if (session.authenticated && returnTo && session.user?.username) {
          departTo(returnTo);
          return;
        }
        setProviders(offered);
        const signedIn = session.authenticated && session.user !== undefined;
        setUser(signedIn ? (session.user ?? null) : null);
        dispatch({
          type: "arrived",
          route,
          signedIn,
          needsUsername: signedIn && !session.user?.username,
          mode: mode === "login" ? undefined : mode,
        });
      })
      .catch(() =>
        dispatch({
          type: "arrived",
          route: "/",
          signedIn: false,
          needsUsername: false,
        }),
      );
  }, []);

  const latest = useRef({ user, view: state.view });
  latest.current = { user, view: state.view };
  useEffect(() => {
    const check = (): void => {
      if (document.visibilityState === "hidden") return;
      void api<SessionResponse>("/api/session").then(
        (session) => {
          const now = session.authenticated ? (session.user ?? null) : null;
          const { user: was, view } = latest.current;
          if (was !== null && now === null) {
            setUser(null);
            dispatch({ type: "expired", text: PASS_ENDED });
          } else if (was === null && now !== null && view === "methods") {
            setUser(now);
            dispatch({ type: "signed-in", needsUsername: !now.username });
          }
        },
        () => undefined,
      );
    };
    const shown = (event: PageTransitionEvent): void => {
      if (event.persisted) check();
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", shown);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pageshow", shown);
    };
  }, []);

  const choices = methodChoices(providers);
  const sections = sectionsFor(user);
  const lit = passKeys(state, choices.length, sections.length);

  function press(key: string): void {
    if (key === "CLR") {
      dispatch(state.view === "code" ? { type: "erase" } : { type: "back" });
      return;
    }
    if (key === "GO") {
      document
        .querySelector<HTMLFormElement>(`#${SCREEN_FORM}`)
        ?.requestSubmit();
      return;
    }
    if (state.view === "methods") {
      const chosen = choices.find((choice) => choice.key === key);
      if (chosen !== undefined) choose(pass, chosen.method);
      return;
    }
    if (state.view === "account") {
      const section = sections.find((each) => each.key === key);
      if (section !== undefined) dispatch({ type: "open", view: section.view });
      return;
    }
    if (state.view === "code") dispatch({ type: "digit", digit: key });
  }

  useMachineKeys(press, lit);
  useEffect(() => {
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      dispatch({ type: "back" });
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);
  useCameraArrival(camera, "screen", {
    moving: "in",
    onRestore: () => screen.current?.classList.remove("is-scanning-off"),
  });
  useScanWipe(screen, state.view);
  useFollowFocus(screen, state.view, focusBack);

  const who = whoOf(user);
  return (
    <PassContext.Provider value={pass}>
      <Machine
        siteName={props.siteName}
        rootOrigin={props.rootOrigin}
        framing="whole"
        ticker={`${props.siteName.toUpperCase()} ACCOUNT · ONE PASS FOR EVERY BAY`}
        chip={{ state: who, word: `${who.toUpperCase()} MODE` }}
        lcd={lcdFor(state, user)}
        keypad={{
          mode: "service",
          lit,
          onPress: press,
          clr: { kind: "button" },
          go: { kind: "submit", form: SCREEN_FORM },
        }}
        machine={{ "data-access": who, "data-view": state.view }}
        plateInert
        cameraRef={camera}
        display={
          <Screen id="screen" screenRef={screen}>
            <Screens />
          </Screen>
        }
      />
    </PassContext.Provider>
  );
}
