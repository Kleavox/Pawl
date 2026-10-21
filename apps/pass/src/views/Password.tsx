import { ApiError, errorMessage, type Identity } from "@pawl/core";
import { deriveLoginKeys } from "@pawl/crypto";
import { Field, Form, Kbd, Note, PW_LINK, Title } from "@pawl/ui";
import { useState, type FormEvent, type ReactNode } from "react";

import { api } from "../helpers";
import { useChallenge, useHumanCheck } from "../useChallenge";
import { finish, Frame, SCREEN_FORM, usePass } from "./context";

export function PasswordStep(): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "password";
  const human = useHumanCheck(shown);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [wasShown, setWasShown] = useState(shown);
  if (shown !== wasShown) {
    setWasShown(shown);
    setEmail("");
    setPassword("");
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (pass.state.busy) return;
    pass.dispatch({ type: "say", say: null });
    pass.dispatch({ type: "busy", busy: true });
    try {
      const { salt } = await human.checked(() =>
        api<{ salt: string | null }>("/api/login/prelogin", { email }),
      );
      if (!salt) throw new Error("Email or password is incorrect.");
      const { authVerifier } = await deriveLoginKeys(password, salt);
      const response = await human.checked(() =>
        api<{ authenticated: true; user: Identity }>("/api/login", {
          email,
          authVerifier,
        }),
      );
      finish(pass, response.user);
    } catch (cause) {
      pass.dispatch({ type: "busy", busy: false });
      pass.dispatch({
        type: "say",
        say: { kind: "error", text: errorMessage(cause) },
      });
    }
  }

  return (
    <Frame
      name="password"
      labelledBy="password-title"
      foot={
        <>
          <Kbd go>GO</Kbd> sign in · <Kbd>CLR</Kbd> back
        </>
      }
    >
      <Title id="password-title">Sign in with your password</Title>
      <Form
        id={shown ? SCREEN_FORM : undefined}
        onSubmit={(event) => void submit(event)}
      >
        <Field
          label="Email"
          id="password-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-autofocus
        />
        <Field
          label="Password"
          id="password-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Form>
      {human.widget}
      <Note tone="line" aside>
        <button
          className={PW_LINK}
          type="button"
          onClick={() => pass.dispatch({ type: "open", view: "forgot" })}
        >
          Forgot password?
        </button>
      </Note>
    </Frame>
  );
}

export function ForgotStep(): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "forgot";
  const challenge = useChallenge({ active: shown });
  const [email, setEmail] = useState("");

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (pass.state.busy) return;
    pass.dispatch({ type: "say", say: null });
    pass.dispatch({ type: "busy", busy: true });
    try {
      await challenge.ensure();
      const response = await api<{ message: string }>("/api/password/forgot", {
        email,
      });
      pass.dispatch({ type: "done", text: response.message });
    } catch (cause) {
      pass.dispatch({ type: "busy", busy: false });
      if (cause instanceof ApiError && cause.code === "challenge_failed") {
        challenge.retry();
        pass.dispatch({
          type: "say",
          say: {
            kind: "error",
            text: "The security check expired. Submit again.",
          },
        });
        return;
      }
      pass.dispatch({
        type: "say",
        say: { kind: "error", text: errorMessage(cause) },
      });
    }
  }

  return (
    <Frame
      name="forgot"
      labelledBy="forgot-title"
      foot={
        <>
          <Kbd go>GO</Kbd> send link · <Kbd>CLR</Kbd> back
        </>
      }
    >
      <Title id="forgot-title">Reset access</Title>
      <Note aside>We email a reset link that lasts 15 minutes.</Note>
      <Form
        id={shown ? SCREEN_FORM : undefined}
        onSubmit={(event) => void submit(event)}
      >
        <Field
          label="Email"
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-autofocus
        />
      </Form>
      {shown ? challenge.widget : null}
    </Frame>
  );
}
