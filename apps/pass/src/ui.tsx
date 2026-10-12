import { errorCodeCopy } from "@pawl/core";
import type { FormEvent, InputHTMLAttributes, ReactNode } from "react";

import { SCREEN_FORM } from "./machine";
import type { FormState } from "./types";

export function guarded(
  blocked: boolean,
  onSubmit: (event: FormEvent) => void,
): (event: FormEvent) => void {
  return (event) => {
    if (blocked) {
      event.preventDefault();
      return;
    }
    onSubmit(event);
  };
}

export function AuthForm({
  title,
  kicker = "Pawl",
  description,
  onSubmit,
  state,
  submitLabel,
  children,
}: {
  title: string;
  kicker?: string;
  description: string;
  onSubmit: (event: FormEvent) => void;
  state: FormState;
  submitLabel: string;
  children: ReactNode;
}) {
  const done = state.status === "loading" || state.status === "success";
  return (
    <form
      id={SCREEN_FORM}
      className="screen-form"
      onSubmit={guarded(done, onSubmit)}
    >
      <div className="screen-form__heading">
        <p className="pw-eyebrow">{kicker}</p>
        <h2 className="pw-heading">{title}</h2>
        <p className="pw-text">{description}</p>
      </div>
      <div className="screen-form__fields">{children}</div>
      <Status state={state} />
      <button
        className="pw-button pw-button-primary screen-form__submit"
        type="submit"
        disabled={done}
      >
        {state.status === "loading" ? "Working…" : submitLabel}
      </button>
    </form>
  );
}

export function Field({
  label,
  hint,
  name,
  value,
  onChange,
  type = "text",
  ...inputProps
}: {
  label: string;
  hint?: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "name" | "value" | "onChange" | "type"
>) {
  return (
    <label className="pw-field">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input
        {...inputProps}
        className="pw-input"
        required
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

const STATUS_CLASS: Record<FormState["status"], string> = {
  idle: "",
  loading: "is-info",
  error: "is-error status-error",
  success: "is-success status-success",
};

export function Status({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p
      className={`pw-status ${STATUS_CLASS[state.status]}`}
      role={state.status === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {state.message}
    </p>
  );
}

export function ResultState({
  title,
  state,
  children,
}: {
  title: string;
  state: FormState;
  children: ReactNode;
}) {
  return (
    <section className="screen-result">
      <p className="pw-eyebrow">Pawl</p>
      <h2 className="pw-heading">{title}</h2>
      {state.status === "loading" ? (
        <div className="pw-loading" aria-label="Loading">
          <span />
          <span />
        </div>
      ) : (
        <Status state={state} />
      )}
      {state.status === "success" && children}
    </section>
  );
}

export function LoadingState() {
  return (
    <section className="screen-result" aria-label="Loading session">
      <p className="pw-eyebrow">Reading pass</p>
      <div className="pw-loading">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

export interface ErrorScreenProps {
  code?: string;
  title?: string;
  message?: string;
  homeHref?: string;
  homeLabel?: string;
}

export function ErrorScreen({
  code,
  title,
  message,
  homeHref = "/",
  homeLabel = "Back to the machine",
}: ErrorScreenProps) {
  const fallback = errorCodeCopy(code);
  return (
    <section className="pw-fault" aria-labelledby="pw-fault-title">
      <p className="pw-eyebrow is-danger">{code ? `Fault ${code}` : "Fault"}</p>
      <h2 className="pw-heading" id="pw-fault-title">
        {title ?? fallback.title}
      </h2>
      <p className="pw-text">{message ?? fallback.message}</p>
      <a className="pw-button pw-button-primary" href={homeHref}>
        {homeLabel}
      </a>
    </section>
  );
}
