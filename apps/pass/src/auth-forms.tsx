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
      kicker="Pass required"
      description="One account for every bay in the machine."
      onSubmit={submit}
      state={state}
      submitLabel="Sign in"
    >
      {(providers.google || providers.github) && (
        <>
          <div className="screen-form__providers">
            {providers.google && (
              <button
                className="pw-button"
                type="button"
                onClick={() => startOAuth("google")}
              >
                <span className="pw-button__mark" aria-hidden="true">
                  G
                </span>
                Continue with Google
              </button>
            )}
            {providers.github && (
              <button
                className="pw-button"
                type="button"
                onClick={() => startOAuth("github")}
              >
                <span className="pw-button__mark" aria-hidden="true">
                  GH
                </span>
                Continue with GitHub
              </button>
            )}
          </div>
          <p className="pw-divider">Or use your password</p>
        </>
      )}
      {oauthError && (
        <p
          className={`pw-status ${oauthError.kind === "info" ? "is-info status-success" : "is-error status-error"}`}
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
        className="pw-link screen-form__aside"
        type="button"
        onClick={() => onModeChange("forgot")}
      >
        Forgot password?
      </button>
      <p className="pw-text screen-form__switch">
        No account?{" "}
        <button
          className="pw-link"
          type="button"
          onClick={() => onModeChange("register")}
        >
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
      kicker="New pass"
      description="One identity for every app in the machine."
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
      <p className="pw-text screen-form__switch">
        Already registered?{" "}
        <button
          className="pw-link"
          type="button"
          onClick={() => onModeChange("login")}
        >
          Back to sign in
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
      kicker="Lost key"
      description="We email a reset link that lasts 15 minutes."
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
        className="pw-link screen-form__switch"
        type="button"
        onClick={() => onModeChange("login")}
      >
        Back to sign in
      </button>
      {challenge.widget}
    </AuthForm>
  );
}
