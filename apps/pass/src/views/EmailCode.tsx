import { ApiError } from "@pawl/core";
import {
  CodeCells,
  Eyebrow,
  Field,
  Form,
  Kbd,
  Note,
  Title,
  ViewButton,
} from "@pawl/ui";
import { useState, type FormEvent, type ReactNode } from "react";

import { CODE_LENGTH } from "../flow";
import { api } from "../helpers";
import { OtpVerifyError, startOtp, verifyOtpCode } from "../otp";
import { useHumanCheck } from "../useChallenge";
import type { SessionResponse } from "../types";
import { finish, Frame, SCREEN_FORM, usePass } from "./context";

function masked(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return domain === "" ? email : `${local.slice(0, 1)}•••@${domain}`;
}

function screenWords(message: string): string {
  return message.replace(/[.]+$/u, "");
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "The machine could not complete that.";
}

export function EmailStep(): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "email";
  const human = useHumanCheck(shown);
  const [email, setEmail] = useState(pass.state.email);
  const [last, setLast] = useState(pass.state.email);
  if (pass.state.email !== last) {
    setLast(pass.state.email);
    setEmail(pass.state.email);
  }

  async function send(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (pass.state.busy) return;
    const address = email.trim();
    if (address === "") {
      pass.dispatch({
        type: "say",
        say: {
          kind: "error",
          text: "Enter the email address your code should go to.",
        },
      });
      return;
    }
    pass.dispatch({ type: "say", say: null });
    pass.dispatch({ type: "busy", busy: true });
    try {
      await human.checked(() => startOtp(address));
    } catch (error) {
      pass.dispatch({ type: "busy", busy: false });
      pass.dispatch({
        type: "say",
        say: { kind: "error", text: messageOf(error) },
      });
      return;
    }
    pass.dispatch({ type: "code-sent", email: address });
  }

  return (
    <Frame
      name="email"
      labelledBy="email-title"
      foot={
        <>
          <Kbd go>GO</Kbd> send · <Kbd>CLR</Kbd> back
        </>
      }
    >
      <Title id="email-title">Where should the code go?</Title>
      <Form
        id={shown ? SCREEN_FORM : undefined}
        onSubmit={(event) => void send(event)}
      >
        <Field
          label="Email"
          id="code-email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-autofocus
          action={
            <ViewButton tone="go" type="submit" disabled={pass.state.busy}>
              Send code
            </ViewButton>
          }
        />
      </Form>
      {human.widget}
    </Frame>
  );
}

export function CodeStep(): ReactNode {
  const pass = usePass();
  const { state } = pass;
  const shown = state.view === "code";
  const human = useHumanCheck(shown);

  async function settleLost(): Promise<void> {
    try {
      const session = await api<SessionResponse>("/api/session");
      if (session.authenticated && session.user) {
        finish(pass, session.user);
        return;
      }
    } catch {
      pass.dispatch({ type: "busy", busy: false });
    }
    pass.dispatch({ type: "busy", busy: false });
    pass.dispatch({
      type: "say",
      say: {
        kind: "error",
        text: "The machine could not tell whether your code went through. Press GO to try it again.",
      },
    });
  }

  async function verify(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (state.busy || state.digits.length < CODE_LENGTH) return;
    pass.dispatch({ type: "say", say: null });
    pass.dispatch({ type: "busy", busy: true });
    let verified;
    try {
      verified = await human.checked(() =>
        verifyOtpCode(state.email, state.digits),
      );
    } catch (error) {
      if (!(error instanceof ApiError) || error.status === 0) {
        await settleLost();
        return;
      }
      const left =
        error instanceof OtpVerifyError ? error.attemptsLeft : undefined;
      if (left === undefined) {
        pass.dispatch({
          type: "code-locked",
          text: screenWords(error.message),
        });
        return;
      }
      pass.dispatch({ type: "code-rejected", attemptsLeft: left });
      return;
    }
    finish(pass, verified.user);
  }

  const tries =
    state.attemptsLeft === null
      ? ""
      : `That code was not right. ${state.attemptsLeft === 1 ? "1 try left" : `${state.attemptsLeft} tries left`}.`;

  return (
    <Frame
      name="code"
      label="Type the code"
      autofocus
      foot={
        <>
          <Kbd>0</Kbd>–<Kbd>9</Kbd> type · <Kbd go>GO</Kbd> check ·{" "}
          <Kbd>CLR</Kbd> erase
        </>
      }
    >
      <form
        id={shown ? SCREEN_FORM : undefined}
        className="contents"
        onSubmit={(event) => void verify(event)}
      >
        <Eyebrow>Code sent</Eyebrow>
        <Title>Type the 6 digits on the keypad</Title>
        <Note aside>
          Sent to <strong>{masked(state.email)}</strong>. The code lasts 10
          minutes.
        </Note>
        <CodeCells digits={state.digits} />
        <Note tone="tries" aside data-code-tries>
          {tries}
        </Note>
      </form>
      {human.widget}
    </Frame>
  );
}
