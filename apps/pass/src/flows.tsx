import { errorMessage } from "@pawl/core";
import type { Identity } from "@pawl/core";
import { createAccountCredential } from "@pawl/crypto";
import { type FormEvent, useEffect, useState } from "react";

import { api } from "./helpers";
import type { FormState } from "./types";
import { AuthForm, ErrorScreen, Field, ResultState } from "./ui";

export function VerifyEmail() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [state, setState] = useState<FormState>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "Verification token is missing." });
      return;
    }
    void api("/api/verify-email", { token })
      .then(() =>
        setState({
          status: "success",
          message: "Email verified. You can now sign in.",
        }),
      )
      .catch((cause) =>
        setState({ status: "error", message: errorMessage(cause) }),
      );
  }, [token]);

  if (state.status === "error") {
    return (
      <ErrorScreen
        title="Verification failed"
        message={
          state.message ?? "This verification link is invalid or has expired."
        }
      />
    );
  }

  return (
    <ResultState title="Verify email" state={state}>
      <a className="pw-button pw-button-primary" href="/">
        Continue to sign in
      </a>
    </ResultState>
  );
}

export function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      setState({ status: "error", message: "Reset token is missing." });
      return;
    }
    setState({ status: "loading" });
    try {
      await api("/api/password/reset", {
        token,
        keys: await createAccountCredential(password),
      });
      setState({
        status: "success",
        message: "Password updated. All previous sessions were revoked.",
      });
    } catch (cause) {
      setState({ status: "error", message: errorMessage(cause) });
    }
  }

  return (
    <AuthForm
      title="Choose a new password"
      kicker="New key"
      description="This signs your account out everywhere and gives it a new encryption key."
      onSubmit={submit}
      state={state}
      submitLabel="Update password"
    >
      <Field
        label="New password"
        hint="Use at least 12 characters."
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        value={password}
        onChange={setPassword}
      />
      {state.status === "success" && (
        <a className="pw-button pw-button-primary" href="/">
          Return to sign in
        </a>
      )}
    </AuthForm>
  );
}

export function Welcome({
  user,
  onCompleted,
}: {
  user: Identity;
  onCompleted: (user: Identity) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [canSetPassword, setCanSetPassword] = useState(false);
  const [state, setState] = useState<FormState>({ status: "idle" });

  useEffect(() => {
    void api<{ providers: string[] }>("/api/account")
      .then((account) =>
        setCanSetPassword(!account.providers.includes("password")),
      )
      .catch((cause) =>
        setState({ status: "error", message: errorMessage(cause) }),
      );
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const withPassword = canSetPassword && password;
    if (withPassword && password !== confirm) {
      setState({ status: "error", message: "Passwords do not match." });
      return;
    }
    setState({ status: "loading" });
    try {
      const result = await api<{ ok: true; user: Identity }>(
        "/api/account/setup",
        withPassword
          ? { username, keys: await createAccountCredential(password) }
          : { username },
      );
      onCompleted(result.user);
    } catch (cause) {
      setState({ status: "error", message: errorMessage(cause) });
    }
  }

  return (
    <AuthForm
      title="Pick your username"
      kicker="Almost there"
      description={`Signed in as ${user.email}. One last step before your pass is printed.`}
      onSubmit={submit}
      state={state}
      submitLabel="Continue"
    >
      <Field
        label="Username"
        hint="3-20 lowercase letters, digits, or underscores."
        name="username"
        autoComplete="username"
        maxLength={20}
        value={username}
        onChange={setUsername}
      />
      {canSetPassword && (
        <>
          <Field
            label="Password (optional)"
            hint="Leave empty to keep signing in with your provider only."
            name="new-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={password}
            onChange={setPassword}
          />
          {password && (
            <Field
              label="Confirm password"
              name="confirm-new-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={confirm}
              onChange={setConfirm}
            />
          )}
        </>
      )}
    </AuthForm>
  );
}

export function LinkOAuth() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [state, setState] = useState<FormState>({ status: "loading" });
  const [provider, setProvider] = useState<string>();

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "The linking token is missing." });
      return;
    }
    void api<{ ok: true; provider: string }>("/api/oauth/link", { token })
      .then((result) => {
        setProvider(result.provider);
        setState({ status: "success" });
      })
      .catch((cause) =>
        setState({ status: "error", message: errorMessage(cause) }),
      );
  }, []);

  if (state.status === "error") {
    return (
      <ErrorScreen
        title="Linking failed"
        message={state.message ?? "We couldn't link this sign-in provider."}
      />
    );
  }

  return (
    <section className="screen-result" aria-label="Link sign-in provider">
      <p className="pw-eyebrow">Pawl</p>
      {state.status === "success" ? (
        <>
          <h2 className="pw-heading">
            {provider === "google" ? "Google" : "GitHub"} linked
          </h2>
          <p className="pw-text">
            You can now use it to sign in to this account.
          </p>
          <a className="pw-button pw-button-primary" href="/">
            Go to sign in
          </a>
        </>
      ) : (
        <>
          <h2 className="pw-heading">Linking…</h2>
          <div className="pw-loading" aria-label="Linking">
            <span />
            <span />
          </div>
        </>
      )}
    </section>
  );
}
