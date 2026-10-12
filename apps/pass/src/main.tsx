import { createRoot } from "react-dom/client";
import {
  type ReactNode,
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { displayHandle } from "@pawl/core";
import "@pawl/ui/styles.css";
import { ROOT_ORIGIN } from "@pawl/ui";
import "./styles.css";
import { Account, type Tab } from "./account";
import { ForgotPassword, Login, Register } from "./auth-forms";
import { ChallengePage } from "./challenge";
import { LinkOAuth, ResetPassword, VerifyEmail, Welcome } from "./flows";
import { api, returnTo } from "./helpers";
import { Machine, initialMode, type Holder } from "./machine";
import type { Mode, OAuthProviders, SessionResponse } from "./types";
import { SITE } from "./site";
import { LoadingState } from "./ui";

type Screen = {
  status: string;
  sub?: string;
  go: boolean;
  back?: () => void;
};

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
          window.location.assign(returnTo);
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
        screen: { status: "READING PASS", sub: "ONE MOMENT", go: false },
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
                  window.location.assign(returnTo);
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
              window.location.assign(returnTo);
              return;
            }
            setSession({ authenticated: true, user: next });
          }}
        />
      ),
      screen: { status: "SIGN IN", sub: "PASS REQUIRED", go: true },
    };
  }, [accountGo, keepAccountGo, mode, providers, route, session, tab, toLogin]);

  return (
    <Machine
      siteName={SITE.site.name}
      rootOrigin={ROOT_ORIGIN}
      status={screen.status}
      sub={screen.sub}
      go={screen.go}
      back={screen.back}
      holder={holder}
    >
      {content}
    </Machine>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
