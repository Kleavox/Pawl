import { ApiError, apiFetch, type Identity } from "@pawl/core";
import { createAccountCredential } from "@pawl/crypto";
import {
  Actions,
  Field,
  Form,
  Kbd,
  PW_LINK,
  Title,
  ViewButton,
} from "@pawl/ui";
import { useState, type FormEvent, type ReactNode } from "react";

import { api, redirectToFreshChallenge } from "../helpers";
import {
  begin,
  failed,
  Frame,
  refusedKey,
  SCREEN_FORM,
  usePass,
  type Pass,
} from "./context";

const PROVIDER_LABELS: Record<string, string> = {
  password: "Password",
  google: "Google",
  github: "GitHub",
};

const FACTS =
  "grid grid-cols-[auto_minmax(0,1fr)] gap-x-16 gap-y-6 w-full m-0 text-15 max-desk:gap-y-4";

const FACT_NAME =
  "text-pw-ice font-pw-mono text-14 font-bold tracking-[0.14em] uppercase";

const FACT_VALUE =
  "m-0 min-w-0 overflow-hidden text-pw-ink text-ellipsis whitespace-nowrap";

function saved(pass: Pass, text: string): void {
  pass.dispatch({ type: "open", view: "profile" });
  pass.dispatch({ type: "say", say: { kind: "success", text } });
}

export function ProfileStep(props: {
  user: Identity;
  providers: string[] | undefined;
}): ReactNode {
  const pass = usePass();
  const { user, providers } = props;
  return (
    <Frame
      name="profile"
      labelledBy="profile-title"
      tells
      foot={
        <>
          <Kbd>CLR</Kbd> back
        </>
      }
    >
      <Title id="profile-title">Profile</Title>
      <dl className={FACTS}>
        <dt className={FACT_NAME}>Username</dt>
        <dd className={FACT_VALUE}>{user.username ?? "—"}</dd>
        <dt className={FACT_NAME}>Email</dt>
        <dd className={FACT_VALUE}>{user.email}</dd>
        <dt className={FACT_NAME}>Role</dt>
        <dd className={FACT_VALUE}>
          {user.role === "ADMIN" ? "Owner" : "Visitor"}
        </dd>
        <dt className={FACT_NAME}>Sign-in</dt>
        <dd className={`${FACT_VALUE} flex gap-10`}>
          {providers === undefined
            ? "--"
            : providers.map((provider) => (
                <span key={provider}>
                  {PROVIDER_LABELS[provider] ?? provider}
                </span>
              ))}
        </dd>
      </dl>
      <Actions>
        <button
          className={PW_LINK}
          type="button"
          onClick={() => pass.dispatch({ type: "open", view: "profile-name" })}
        >
          Edit username
        </button>
        {providers !== undefined && !providers.includes("password") ? (
          <button
            className={PW_LINK}
            type="button"
            onClick={() => pass.dispatch({ type: "open", view: "profile-key" })}
          >
            Set a password
          </button>
        ) : null}
      </Actions>
    </Frame>
  );
}

export function ProfileNameStep(props: { user: Identity }): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "profile-name";
  const [name, setName] = useState(props.user.username ?? "");
  const [wasShown, setWasShown] = useState(shown);
  if (shown !== wasShown) {
    setWasShown(shown);
    if (shown) setName(props.user.username ?? "");
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (pass.state.busy || name.trim() === "") return;
    begin(pass);
    try {
      const result = await apiFetch<{ ok: true; user: Identity }>(
        "/api/account",
        { method: "PATCH", body: JSON.stringify({ username: name }) },
      );
      pass.setUser(result.user);
      saved(pass, "Username updated.");
    } catch (cause) {
      failed(pass, cause);
    }
  }

  return (
    <Frame
      name="profile-name"
      labelledBy="profile-name-title"
      foot={
        <>
          <Kbd go>GO</Kbd> save · <Kbd>CLR</Kbd> back
        </>
      }
    >
      <Title id="profile-name-title">Change your username</Title>
      <Form
        id={shown ? SCREEN_FORM : undefined}
        onSubmit={(event) => void save(event)}
      >
        <Field
          label="Username"
          id="profile-username"
          name="username"
          autoComplete="username"
          maxLength={20}
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-autofocus
          action={
            <ViewButton
              tone="go"
              type="submit"
              disabled={pass.state.busy || name.trim() === ""}
            >
              Save
            </ViewButton>
          }
        />
      </Form>
    </Frame>
  );
}

export function ProfileKeyStep(props: { onPassword: () => void }): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "profile-key";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [wasShown, setWasShown] = useState(shown);
  if (shown !== wasShown) {
    setWasShown(shown);
    setPassword("");
    setConfirm("");
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (pass.state.busy) return;
    if (refusedKey(pass, password, confirm)) return;
    begin(pass);
    try {
      await api("/api/account/password", {
        keys: await createAccountCredential(password),
      });
      props.onPassword();
      saved(pass, "Password set. You can now sign in with it.");
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "challenge_failed") {
        redirectToFreshChallenge();
        return;
      }
      failed(pass, cause);
    }
  }

  return (
    <Frame
      name="profile-key"
      labelledBy="profile-key-title"
      foot={
        <>
          <Kbd go>GO</Kbd> save · <Kbd>CLR</Kbd> back
        </>
      }
    >
      <Title id="profile-key-title">Set a password</Title>
      <Form
        id={shown ? SCREEN_FORM : undefined}
        onSubmit={(event) => void save(event)}
      >
        <Field
          label="New password"
          id="profile-password"
          name="new-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-autofocus
        />
        <Field
          label="Confirm password"
          id="profile-confirm"
          name="confirm-new-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </Form>
    </Frame>
  );
}
