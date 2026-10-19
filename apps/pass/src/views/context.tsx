import {
  ApiError,
  displayHandle,
  errorMessage,
  type Identity,
} from "@pawl/core";
import {
  Bar,
  BarLink,
  Body,
  Foot,
  Note,
  Say,
  shouldAnimateClick,
  Step,
  View,
} from "@pawl/ui";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";

import { departTo } from "../depart";
import type { PassEvent, PassState, PassView } from "../flow";
import { api, returnTo } from "../helpers";
import type { OAuthProviders } from "../types";

export const SCREEN_FORM = "screen-form";

export type Draft = { username: string; email: string };

export type Pass = {
  state: PassState;
  dispatch: (event: PassEvent) => void;
  siteName: string;
  rootOrigin: string;
  providers: OAuthProviders;
  user: Identity | null;
  setUser: (user: Identity | null) => void;
  draft: Draft;
  setDraft: (draft: Draft) => void;
};

export const PassContext = createContext<Pass | null>(null);

export function usePass(): Pass {
  const pass = useContext(PassContext);
  if (pass === null) throw new Error("A paw. view needs the paw. page.");
  return pass;
}

export type Who = "guest" | "owner" | "visitor";

export function whoOf(user: Identity | null): Who {
  if (user === null || !user.username) return "guest";
  return user.role === "ADMIN" ? "owner" : "visitor";
}

export function handleOf(user: Identity | null): string {
  return user === null
    ? ""
    : displayHandle(user.username, user.email).toUpperCase();
}

export function finish(pass: Pass, user: Identity): void {
  if (!user.username) {
    pass.setUser(user);
    pass.dispatch({ type: "signed-in", needsUsername: true });
    return;
  }
  if (returnTo) {
    departTo(returnTo);
    return;
  }
  pass.setUser(user);
  pass.dispatch({ type: "signed-in", needsUsername: false });
}

function said(pass: Pass, name: PassView): string {
  const say = pass.state.say;
  return pass.state.view === name && say?.kind === "error" ? say.text : "";
}

function told(pass: Pass, name: PassView): string {
  const say = pass.state.say;
  return pass.state.view === name && say?.kind === "success" ? say.text : "";
}

const SHORTEST_KEY = 12;

export function refusedKey(
  pass: Pass,
  password: string,
  confirm: string = password,
): boolean {
  const problem =
    password.length < SHORTEST_KEY
      ? `Use at least ${SHORTEST_KEY} characters.`
      : password !== confirm
        ? "Passwords do not match."
        : null;
  if (problem === null) return false;
  pass.dispatch({ type: "say", say: { kind: "error", text: problem } });
  return true;
}

export function begin(pass: Pass): void {
  pass.dispatch({ type: "say", say: null });
  pass.dispatch({ type: "busy", busy: true });
}

export const PASS_ENDED = "Your pass ended. Sign in to go on.";
const SIGN_IN_AGAIN = "Sign in again to change registered apps.";

function followedEnd(pass: Pass, cause: unknown): boolean {
  if (!(cause instanceof ApiError)) return false;
  const ended =
    cause.status === 401 &&
    (cause.code === "unauthorized" || cause.code === "login_required");
  if (!ended && cause.code !== "reauth_required") return false;
  const lead = (): void => {
    pass.setUser(null);
    pass.dispatch({
      type: "expired",
      text: ended ? PASS_ENDED : SIGN_IN_AGAIN,
    });
  };
  if (ended) lead();
  else void api("/api/logout", {}).then(lead, lead);
  return true;
}

export function useFollowEnd(): (cause: unknown) => boolean {
  const pass = usePass();
  const latest = useRef(pass);
  latest.current = pass;
  return useCallback((cause) => followedEnd(latest.current, cause), []);
}

export function failed(pass: Pass, cause: unknown): void {
  if (followedEnd(pass, cause)) return;
  pass.dispatch({ type: "busy", busy: false });
  pass.dispatch({
    type: "say",
    say: { kind: "error", text: errorMessage(cause) },
  });
}

export function signedOut(pass: Pass): void {
  pass.setUser(null);
  pass.dispatch({ type: "signed-out" });
}

export async function signOutVia(pass: Pass, path: string): Promise<void> {
  begin(pass);
  try {
    await api(path, {});
    signedOut(pass);
  } catch (cause) {
    failed(pass, cause);
  }
}

export function Frame(props: {
  name: PassView;
  where: string;
  step?: string;
  labelledBy?: string;
  label?: string;
  autofocus?: boolean;
  foot: ReactNode;
  back?: ReactNode;
  tells?: boolean;
  children: ReactNode;
}): ReactNode {
  const pass = usePass();
  const who = whoOf(pass.user);
  const machine = `${pass.rootOrigin}/`;
  return (
    <View
      name={props.name}
      hidden={pass.state.view !== props.name}
      tabIndex={-1}
      aria-labelledby={props.labelledBy}
      aria-label={props.label}
      data-autofocus={props.autofocus ? "" : undefined}
    >
      <Bar
        where={
          who === "guest"
            ? props.where
            : `HI, ${handleOf(pass.user)} · ${who.toUpperCase()}`
        }
      >
        {props.step === undefined ? null : <Step>{props.step}</Step>}
        <BarLink
          href={machine}
          data-to-machine
          onClick={(event) => {
            if (!shouldAnimateClick(event.nativeEvent)) return;
            event.preventDefault();
            departTo(event.currentTarget.href);
          }}
        >
          ‹ MACHINE
        </BarLink>
      </Bar>
      <Body>
        {props.children}
        <Say>{said(pass, props.name)}</Say>
        {props.tells ? (
          <Note tone="line" role="status">
            {told(pass, props.name)}
          </Note>
        ) : null}
        {props.back}
      </Body>
      <Foot hint={props.foot} />
    </View>
  );
}
