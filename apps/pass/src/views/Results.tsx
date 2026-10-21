import { errorMessage } from "@pawl/core";
import { createAccountCredential } from "@pawl/crypto";
import {
  Actions,
  Eyebrow,
  Field,
  Form,
  Kbd,
  Loader,
  Note,
  Title,
  ViewLink,
} from "@pawl/ui";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { api } from "../helpers";
import { useChallenge } from "../useChallenge";
import { Frame, refusedKey, SCREEN_FORM, usePass } from "./context";

type Outcome =
  | { status: "loading" }
  | { status: "done"; text: string }
  | { status: "failed"; text: string };

function token(): string {
  return typeof window === "undefined"
    ? ""
    : (new URLSearchParams(window.location.search).get("token") ?? "");
}

function useOnce(
  active: boolean,
  run: () => Promise<string>,
  missing: string,
): Outcome {
  const [outcome, setOutcome] = useState<Outcome>({ status: "loading" });
  useEffect(() => {
    if (!active) return;
    if (token() === "") {
      setOutcome({ status: "failed", text: missing });
      return;
    }
    let cancelled = false;
    run()
      .then((text) => {
        if (!cancelled) setOutcome({ status: "done", text });
      })
      .catch((cause) => {
        if (!cancelled) {
          setOutcome({ status: "failed", text: errorMessage(cause) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active]);
  return outcome;
}

function Outcome(props: {
  outcome: Outcome;
  title: { loading: string; done: string; failed: string };
  next: { href: string; label: string };
}): ReactNode {
  const { outcome } = props;
  return (
    <>
      <Eyebrow ok={outcome.status === "done"}>
        {outcome.status === "failed" ? "Fault" : "Pawl"}
      </Eyebrow>
      <Title>{props.title[outcome.status]}</Title>
      {outcome.status === "loading" ? (
        <Loader />
      ) : (
        <Note tone={outcome.status === "failed" ? "tries" : "plain"}>
          {outcome.text}
        </Note>
      )}
      {outcome.status === "loading" ? null : (
        <Actions>
          <ViewLink tone="go" href={props.next.href}>
            {props.next.label}
          </ViewLink>
        </Actions>
      )}
    </>
  );
}

export function VerifyStep(): ReactNode {
  const pass = usePass();
  const outcome = useOnce(
    pass.state.view === "verify",
    async () => {
      await api("/api/verify-email", { token: token() });
      return "Email verified. You can now sign in.";
    },
    "Verification token is missing.",
  );
  return (
    <Frame name="verify" label="Verify email" foot="checking the link">
      <Outcome
        outcome={outcome}
        title={{
          loading: "Checking the link",
          done: "Email verified",
          failed: "Verification failed",
        }}
        next={{ href: "/", label: "Continue to sign in" }}
      />
    </Frame>
  );
}

export function LinkStep(): ReactNode {
  const pass = usePass();
  const outcome = useOnce(
    pass.state.view === "link",
    async () => {
      const result = await api<{ ok: true; provider: string }>(
        "/api/oauth/link",
        { token: token() },
      );
      return `${result.provider === "google" ? "Google" : "GitHub"} linked. You can now use it to sign in to this account.`;
    },
    "The linking token is missing.",
  );
  return (
    <Frame
      name="link"
      label="Link sign-in provider"
      foot="linking the provider"
    >
      <Outcome
        outcome={outcome}
        title={{
          loading: "Linking…",
          done: "Provider linked",
          failed: "Linking failed",
        }}
        next={{ href: "/", label: "Go to sign in" }}
      />
    </Frame>
  );
}

export function ResetStep(): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "reset";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState("");

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (pass.state.busy || done !== "") return;
    if (token() === "") {
      pass.dispatch({
        type: "say",
        say: { kind: "error", text: "Reset token is missing." },
      });
      return;
    }
    if (refusedKey(pass, password)) return;
    pass.dispatch({ type: "say", say: null });
    pass.dispatch({ type: "busy", busy: true });
    try {
      await api("/api/password/reset", {
        token: token(),
        keys: await createAccountCredential(password),
      });
      setPassword("");
      setDone("Password updated. All previous sessions were revoked.");
    } catch (cause) {
      pass.dispatch({
        type: "say",
        say: { kind: "error", text: errorMessage(cause) },
      });
    } finally {
      pass.dispatch({ type: "busy", busy: false });
    }
  }

  return (
    <Frame
      name="reset"
      labelledBy="reset-title"
      foot={
        <>
          <Kbd go>GO</Kbd> update
        </>
      }
    >
      <Title id="reset-title">Choose a new password</Title>
      <Note aside>
        This signs your account out everywhere and gives it a new encryption
        key.
      </Note>
      {done === "" ? (
        <Form
          id={shown ? SCREEN_FORM : undefined}
          onSubmit={(event) => void submit(event)}
        >
          <Field
            label="New password"
            id="reset-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            data-autofocus
          />
        </Form>
      ) : (
        <>
          <Note>{done}</Note>
          <Actions>
            <ViewLink tone="go" href="/">
              Return to sign in
            </ViewLink>
          </Actions>
        </>
      )}
    </Frame>
  );
}

export function ChallengeStep(): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "challenge";
  const params =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const challenge = useChallenge({
    scope: params.get("scope") === "fresh" ? "fresh" : "basic",
    returnTo: params.get("returnTo"),
    skipStatusCheck: true,
    onComplete: (target) => window.location.assign(target),
    active: shown,
  });
  return (
    <Frame name="challenge" label="Security check" foot="one moment">
      <Eyebrow>Human check</Eyebrow>
      <Title>Just a moment</Title>
      <Note>
        Cloudflare Turnstile is checking that a person stands at the machine.
      </Note>
      {challenge.failed ? null : <Loader />}
      {shown ? challenge.widget : null}
    </Frame>
  );
}
