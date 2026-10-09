import { ApiError, errorMessage } from "@pawl/core";
import type { Identity } from "@pawl/core";
import { createAccountCredential, deriveLoginKeys } from "@pawl/crypto";
import { type FormEvent, useState } from "react";

import { useChallenge } from "./challenge";
import { api, oauthErrorMessage, startOAuth } from "./helpers";
import type { FormState, Mode, OAuthProviders } from "./types";
import { AuthForm, Field } from "./ui";

export function Login({
  providers,
  onModeChange,
  onAuthenticated,
}: {
  providers: OAuthProviders;
  onModeChange: (mode: Mode) => void;
  onAuthenticated: (user: Identity) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });
  const oauthError = oauthErrorMessage(
    new URLSearchParams(window.location.search).get("oauthError"),
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState({ status: "loading" });
    try {
      const { salt } = await api<{ salt: string | null }>(
        "/api/login/prelogin",
        { email },
      );
      if (!salt) {
        throw new Error("Email or password is incorrect.");
      }
      const { authVerifier } = await deriveLoginKeys(password, salt);
      const response = await api<{ authenticated: true; user: Identity }>(
        "/api/login",
        { email, authVerifier },
      );
      onAuthenticated(response.user);
    } catch (cause) {
      setState({ status: "error", message: errorMessage(cause) });
    }
  }

  return (
    <AuthForm
      title="Sign in"
      description="Use your account or a connected provider."
      onSubmit={submit}
      state={state}
      submitLabel="Sign in"
    >
      {(providers.google || providers.github) && (
        <>
          <div className="oauth">
            {providers.google && (
              <button type="button" onClick={() => startOAuth("google")}>
                <span>G</span>
                Google
              </button>
            )}
            {providers.github && (
              <button type="button" onClick={() => startOAuth("github")}>
                <span>GH</span>
                GitHub
              </button>
            )}
          </div>
          <div className="divider">
            <span>or</span>
          </div>
        </>
      )}
      {oauthError && (
        <p
          className={`status status-${oauthError.kind === "info" ? "success" : "error"}`}
          role={oauthError.kind === "info" ? "status" : "alert"}
        >
          {oauthError.text}
        </p>
      )}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
      />
      <button
        className="text-action align-right"
        type="button"
        onClick={() => onModeChange("forgot")}
      >
        Forgot password?
      </button>
      <p className="switch">
        No account?{" "}
        <button type="button" onClick={() => onModeChange("register")}>
          Create an account
        </button>
      </p>
    </AuthForm>
  );
}

export function Register({
  onModeChange,
}: {
  onModeChange: (mode: Mode) => void;
}) {
  const challenge = useChallenge();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setState({ status: "error", message: "Passwords do not match." });
      return;
    }
    setState({ status: "loading" });
    try {
      await challenge.ensure();
      const response = await api<{ message: string }>("/api/register", {
        username: name,
        email,
        keys: await createAccountCredential(password),
      });
      setState({ status: "success", message: response.message });
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "challenge_failed") {
        challenge.retry();
        setState({
          status: "error",
          message: "The security check expired. Submit again.",
        });
        return;
      }
      setState({ status: "error", message: errorMessage(cause) });
    }
  }

  return (
    <AuthForm
      title="Create your account"
      description="Create one identity for Pawl."
      onSubmit={submit}
      state={state}
      submitLabel="Create account"
    >
      <Field
        label="Username"
        hint="3-20 lowercase letters, digits, or underscores."
        name="username"
        autoComplete="username"
        maxLength={20}
        value={name}
        onChange={setName}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
      />
      <Field
        label="Password"
        hint="Use at least 12 characters."
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        value={password}
        onChange={setPassword}
      />
      <Field
        label="Confirm password"
        name="confirm-password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        value={confirmPassword}
        onChange={setConfirmPassword}
      />
      <p className="switch form-trailing">
        Already registered?{" "}
        <button type="button" onClick={() => onModeChange("login")}>
          Sign in
        </button>
      </p>
      {challenge.widget}
    </AuthForm>
  );
}

export function ForgotPassword({
  onModeChange,
}: {
  onModeChange: (mode: Mode) => void;
}) {
  const challenge = useChallenge();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState({ status: "loading" });
    try {
      await challenge.ensure();
      const response = await api<{ message: string }>("/api/password/forgot", {
        email,
      });
      setState({ status: "success", message: response.message });
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "challenge_failed") {
        challenge.retry();
        setState({
          status: "error",
          message: "The security check expired. Submit again.",
        });
        return;
      }
      setState({ status: "error", message: errorMessage(cause) });
    }
  }

  return (
    <AuthForm
      title="Reset access"
      description="Receive a short-lived reset link."
      onSubmit={submit}
      state={state}
      submitLabel="Send reset link"
    >
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
      />
      <button
        className="text-action form-trailing"
        type="button"
        onClick={() => onModeChange("login")}
      >
        Back to sign in
      </button>
      {challenge.widget}
    </AuthForm>
  );
}
