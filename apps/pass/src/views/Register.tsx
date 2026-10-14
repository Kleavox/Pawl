import { ApiError, errorMessage } from "@pawl/core";
import { createAccountCredential } from "@pawl/crypto";
import { Back, Field, Form, Kbd, Note, PW_LINK, Title } from "@pawl/ui";
import { useState, type FormEvent, type ReactNode } from "react";

import { api } from "../helpers";
import { useChallenge } from "../useChallenge";
import { Frame, refusedKey, SCREEN_FORM, usePass } from "./context";

export function RegisterStep(): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "register";

  function next(event: FormEvent): void {
    event.preventDefault();
    if (pass.draft.username.trim() === "" || pass.draft.email.trim() === "") {
      pass.dispatch({
        type: "say",
        say: { kind: "error", text: "Fill in a username and an email." },
      });
      return;
    }
    pass.dispatch({ type: "open", view: "register-key" });
  }

  return (
    <Frame
      name="register"
      where="CREATE ACCOUNT"
      step="STEP 1 OF 2"
      labelledBy="register-title"
      foot={
        <>
          <Kbd go>GO</Kbd> next · <Kbd>CLR</Kbd> back
        </>
      }
      back={
        <Back
          label="Other ways to sign in"
          onClick={() => pass.dispatch({ type: "back" })}
        />
      }
    >
      <Title id="register-title">Create your account</Title>
      <Form id={shown ? SCREEN_FORM : undefined} onSubmit={next}>
        <Field
          label="Username"
          id="register-username"
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
        <Field
          label="Email"
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={pass.draft.email}
          onChange={(event) =>
            pass.setDraft({ ...pass.draft, email: event.target.value })
          }
        />
      </Form>
      <Note tone="line" aside>
        3-20 lowercase letters, digits, or underscores. Already registered?{" "}
        <button
          className={PW_LINK}
          type="button"
          onClick={() => pass.dispatch({ type: "open", view: "password" })}
        >
          Sign in
        </button>
      </Note>
    </Frame>
  );
}

export function RegisterKeyStep(): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "register-key";
  const challenge = useChallenge({ active: shown });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  async function create(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (pass.state.busy) return;
    if (refusedKey(pass, password, confirm)) return;
    pass.dispatch({ type: "say", say: null });
    pass.dispatch({ type: "busy", busy: true });
    try {
      await challenge.ensure();
      const response = await api<{ message: string }>("/api/register", {
        username: pass.draft.username,
        email: pass.draft.email,
        keys: await createAccountCredential(password),
      });
      setPassword("");
      setConfirm("");
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
      name="register-key"
      where="CREATE ACCOUNT"
      step="STEP 2 OF 2"
      labelledBy="register-key-title"
      foot={
        <>
          <Kbd go>GO</Kbd> create · <Kbd>CLR</Kbd> back
        </>
      }
      back={
        <Back
          label="Change the username or email"
          onClick={() => pass.dispatch({ type: "back" })}
        />
      }
    >
      <Title id="register-key-title">Choose a password</Title>
      <Form
        id={shown ? SCREEN_FORM : undefined}
        onSubmit={(event) => void create(event)}
      >
        <Field
          label="Password"
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="12 characters or more"
          minLength={12}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-autofocus
        />
        <Field
          label="Confirm password"
          id="register-confirm"
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </Form>
      {shown ? challenge.widget : null}
    </Frame>
  );
}

export function SentStep(): ReactNode {
  const pass = usePass();
  const message =
    pass.state.view === "sent" && pass.state.say?.kind === "success"
      ? pass.state.say.text
      : "";
  return (
    <Frame
      name="sent"
      where="CHECK YOUR INBOX"
      step="SENT"
      labelledBy="sent-title"
      foot={
        <>
          <Kbd>CLR</Kbd> back to sign in
        </>
      }
      back={
        <Back
          label="Back to sign in"
          onClick={() => pass.dispatch({ type: "back" })}
        />
      }
    >
      <Title id="sent-title">Look in your inbox</Title>
      <Note>{message}</Note>
    </Frame>
  );
}
