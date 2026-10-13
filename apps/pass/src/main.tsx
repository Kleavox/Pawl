import { createRoot } from "react-dom/client";
import {
  type ReactNode,
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { displayHandle } from "@pawl/core";
import "@pawl/ui/styles.css";
import "@pawl/ui/machine.css";
import { arrivalFraming, cleanCamHint, settle } from "@pawl/ui";
import "./styles.css";
import { Account, type Tab } from "./account";
import { ForgotPassword, Login, Register } from "./auth-forms";
import { ChallengePage } from "./challenge";
import { LinkOAuth, ResetPassword, VerifyEmail, Welcome } from "./flows";
import { api, returnTo } from "./helpers";
import { departTo, mountDepartures } from "./depart";
import {
  initialMode,
  machineParts,
  paintMachine,
  type Holder,
  type Screen,
} from "./machine";
import type { Mode, OAuthProviders, SessionResponse } from "./types";
import { LoadingState } from "./ui";

const WIPE_MS = 220;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const parts = machineParts(document);
const camera = document.querySelector<HTMLElement>("[data-camera]");
const view = document.getElementById("screen");
const goBack: { current: (() => void) | undefined } = { current: undefined };

function reducedMotion(): boolean {
  try {
    return globalThis.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

function App() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [mode, setMode] = useState<Mode>(() =>
    initialMode(window.location.search),
  );
  const [providers, setProviders] = useState<OAuthProviders>({
    google: false,
    github: false,
  });
  const [tab, setTab] = useState<Tab>("profile");
  const [accountGo, setAccountGo] = useState(false);
  const route = window.location.pathname;
  const keepAccountGo = useCallback(
    (ready: boolean) => setAccountGo(ready),
    [],
  );

  useEffect(() => {
    if (route === "/verify" || route === "/reset" || route === "/challenge")
      return;
    void Promise.all([
      api<SessionResponse>("/api/session"),
      api<OAuthProviders>("/api/oauth/providers"),
    ])
      .then(([nextSession, nextProviders]) => {
        if (
          nextSession.authenticated &&
          returnTo &&
          nextSession.user?.username
        ) {
          departTo(returnTo);
          return;
        }
        setProviders(nextProviders);
        setSession(nextSession);
      })
      .catch(() => setSession({ authenticated: false }));
  }, [route]);

  const user = session?.authenticated ? (session.user ?? null) : null;
  const holder: Holder | null =
    user && user.username
      ? { handle: displayHandle(user.username, user.email), role: user.role }
      : null;
  const toLogin = useCallback(() => setMode("login"), []);

  const { content, screen } = useMemo((): {
    content: ReactNode;
    screen: Screen;
  } => {
    if (route === "/verify") {
      return {
        content: <VerifyEmail />,
        screen: { status: "VERIFY EMAIL", sub: "CHECKING THE LINK", go: false },
      };
    }
    if (route === "/reset") {
      return {
        content: <ResetPassword />,
        screen: {
          status: "NEW PASSWORD",
          sub: "RE-KEYING THE ACCOUNT",
          go: true,
        },
      };
    }
    if (route === "/challenge") {
      return {
        content: <ChallengePage />,
        screen: { status: "HUMAN CHECK", sub: "ONE MOMENT", go: false },
      };
    }
    if (route === "/link-oauth") {
      return {
        content: <LinkOAuth />,
        screen: { status: "LINK PROVIDER", sub: "ONE MOMENT", go: false },
      };
    }
    if (session === null) {
      return {
        content: <LoadingState />,
        screen: { status: "ONE MOMENT", sub: "CHECKING YOUR PASS", go: false },
      };
    }
    if (session.authenticated && session.user) {
      if (!session.user.username) {
        return {
          content: (
            <Welcome
              user={session.user}
              onCompleted={(next) => {
                if (returnTo) {
                  departTo(returnTo);
                  return;
                }
                setSession({ authenticated: true, user: next });
              }}
            />
          ),
          screen: {
            status: "PASS ALMOST READY",
            sub: "PICK A USERNAME",
            go: true,
          },
        };
      }
      return {
        content: (
          <Account
            user={session.user}
            tab={tab}
            onTab={setTab}
            onGo={keepAccountGo}
            onSignedOut={() => {
              setTab("profile");
              setSession({ authenticated: false });
            }}
          />
        ),
        screen: {
          status: `ACCOUNT · ${tab.toUpperCase()}`,
          sub: "PASS ACCEPTED",
          go: accountGo,
          back: tab === "profile" ? undefined : () => setTab("profile"),
        },
      };
    }
    if (mode === "register") {
      return {
        content: <Register onModeChange={setMode} />,
        screen: {
          status: "CREATE ACCOUNT",
          sub: "NEW PASS",
          go: true,
          back: toLogin,
        },
      };
    }
    if (mode === "forgot") {
      return {
        content: <ForgotPassword onModeChange={setMode} />,
        screen: {
          status: "RESET ACCESS",
          sub: "LOST KEY",
          go: true,
          back: toLogin,
        },
      };
    }
    return {
      content: (
        <Login
          providers={providers}
          onModeChange={setMode}
          onAuthenticated={(next) => {
            if (returnTo) {
              departTo(returnTo);
              return;
            }
            setSession({ authenticated: true, user: next });
          }}
        />
      ),
      screen: { status: "SIGN IN", sub: "PASS REQUIRED", go: true },
    };
  }, [accountGo, keepAccountGo, mode, providers, route, session, tab, toLogin]);

  const shown = useRef<string | null>(null);

  useEffect(() => {
    goBack.current = screen.back;
    if (parts !== null) paintMachine(parts, screen, holder);
  }, [screen, holder]);

  useEffect(() => {
    const before = shown.current;
    shown.current = screen.status;
    if (before === null || before === screen.status) return;
    if (view === null || reducedMotion()) return;
    view.classList.remove("is-wiping");
    void view.offsetWidth;
    view.classList.add("is-wiping");
    const done = setTimeout(() => view.classList.remove("is-wiping"), WIPE_MS);
    return () => clearTimeout(done);
  }, [screen.status]);

  return content;
}

parts?.clr.addEventListener("click", () => goBack.current?.());
mountDepartures(document);

const arrived = arrivalFraming(window.location.hash);
cleanCamHint(window.location, window.history);
if (camera !== null) {
  void settle(camera, arrived, "screen", { moving: "in" });
}
document.querySelector(".plate")?.setAttribute("inert", "");

window.addEventListener("pageshow", (event) => {
  if (!event.persisted || camera === null) return;
  view?.classList.remove("is-scanning-off");
  delete document.querySelector<HTMLElement>("[data-machine]")?.dataset.leaving;
  void settle(
    camera,
    arrivalFraming(`#cam=${camera.dataset.framing ?? ""}`),
    "screen",
  );
});

createRoot(view!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
