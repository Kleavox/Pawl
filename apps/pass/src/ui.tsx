import type { FormEvent, InputHTMLAttributes, ReactNode } from "react";

import type { FormState } from "./types";

export function AuthForm({
  title,
  description,
  onSubmit,
  state,
  submitLabel,
  children,
}: {
  title: string;
  description: string;
  onSubmit: (event: FormEvent) => void;
  state: FormState;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="form-heading">
        <p className="section-label">Pawl</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="fields">{children}</div>
      <Status state={state} />
      <button
        className="primary"
        type="submit"
        disabled={state.status === "loading" || state.status === "success"}
      >
        {state.status === "loading" ? "Working..." : submitLabel}
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
    <label className="field">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input
        {...inputProps}
        required
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function Status({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p
      className={`status status-${state.status}`}
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
    <section className="result">
      <p className="section-label">Pawl</p>
      <h2>{title}</h2>
      {state.status === "loading" ? (
        <div className="loading-lines" aria-label="Loading">
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
    <section className="result" aria-label="Loading session">
      <div className="loading-lines">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
