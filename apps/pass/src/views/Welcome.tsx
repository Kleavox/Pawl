import { errorMessage, type Identity } from "@pawl/core";
import { createAccountCredential } from "@pawl/crypto";
import { Field, Form, Kbd, Note, PW_LINK, Title } from "@pawl/ui";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { api } from "../helpers";
import {
  finish,
  Frame,
  refusedKey,
  SCREEN_FORM,
  usePass,
  type Pass,
} from "./context";

async function save(
  pass: Pass,
  username: string,
  password: string | null,
): Promise<void> {
  pass.dispatch({ type: "say", say: null });
  pass.dispatch({ type: "busy", busy: true });
  try {
    const result = await api<{ ok: true; user: Identity }>(
      "/api/account/setup",
      password === null
        ? { username }
        : { username, keys: await createAccountCredential(password) },
    );
    finish(pass, result.user);
  } catch (cause) {
    pass.dispatch({ type: "busy", busy: false });
    pass.dispatch({
      type: "say",
      say: { kind: "error", text: errorMessage(cause) },
    });
  }
}

export function WelcomeStep(props: { canSetPassword: boolean }): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "welcome";

  function next(event: FormEvent): void {
    event.preventDefault();
    if (pass.state.busy) return;
    if (pass.draft.username.trim() === "") {
      pass.dispatch({
        type: "say",
        say: { kind: "error", text: "Pick a username first." },
      });
      return;
    }
    if (props.canSetPassword) {
      pass.dispatch({ type: "open", view: "welcome-key" });
      return;
    }
    void save(pass, pass.draft.username, null);
  }

  return (
    <Frame
      name="welcome"
      where="PASS ALMOST READY"
      step={props.canSetPassword ? "STEP 1 OF 2" : "LAST STEP"}
      labelledBy="welcome-title"
      foot={
        <>
          <Kbd go>GO</Kbd> continue
        </>
      }
    >
      <Title id="welcome-title">Pick your username</Title>
      <Note tone="line" aside>
        Signed in as {pass.user?.email ?? ""}. One last step before your pass is
        printed.
      </Note>
      <Form id={shown ? SCREEN_FORM : undefined} onSubmit={next}>
        <Field
          label="Username"
          id="welcome-username"
          name="username"
          autoComplete="username"
          maxLength={20}
          required
          value={pass.draft.username}
          onChange={(event) =>
            pass.setDraft({ ...pass.draft, username: event.target.value })
          }
          data-autofocus
        />
      </Form>
      <Note aside>3-20 lowercase letters, digits, or underscores.</Note>
    </Frame>
  );
}

export function WelcomeKeyStep(): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "welcome-key";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (pass.state.busy) return;
    if (password === "") {
      void save(pass, pass.draft.username, null);
      return;
    }
    if (refusedKey(pass, password, confirm)) return;
    void save(pass, pass.draft.username, password);
  }

  return (
    <Frame
      name="welcome-key"
      where="PASS ALMOST READY"
      step="STEP 2 OF 2"
      labelledBy="welcome-key-title"
      foot={
        <>
          <Kbd go>GO</Kbd> save · <Kbd>CLR</Kbd> back
        </>
      }
    >
      <Title id="welcome-key-title">Add a password?</Title>
      <Form id={shown ? SCREEN_FORM : undefined} onSubmit={submit}>
        <Field
          label="Password (optional)"
          id="welcome-password"
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
          id="welcome-confirm"
          name="confirm-new-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </Form>
      <Note tone="line">
        <button
          className={PW_LINK}
          type="button"
          disabled={pass.state.busy}
          onClick={() => void save(pass, pass.draft.username, null)}
        >
          Skip
        </button>{" "}
        and keep signing in with your provider only.
      </Note>
    </Frame>
  );
}

export function useCanSetPassword(signedIn: boolean): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void api<{ providers: string[] }>("/api/account")
      .then((account) => {
        if (!cancelled) setCan(!account.providers.includes("password"));
      })
      .catch(() => {
        if (!cancelled) setCan(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);
  return can;
}
