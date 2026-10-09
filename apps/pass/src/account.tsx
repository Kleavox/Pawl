import { ApiError, apiFetch, errorMessage } from "@pawl/core";
import type { Identity } from "@pawl/core";
import { createAccountCredential } from "@pawl/crypto";
import { StatusLine, formatAge } from "@pawl/ui";
import { type FormEvent, useEffect, useState } from "react";

import { api, deviceLabel, redirectToFreshChallenge } from "./helpers";
import type { DeviceSession, FormState } from "./types";
import { Field, Status } from "./ui";

const PROVIDER_LABELS: Record<string, string> = {
  password: "Password",
  google: "Google",
  github: "GitHub",
};

export function Account({
  user,
  onSignedOut,
}: {
  user: Identity;
  onSignedOut: () => void;
}) {
  const [identity, setIdentity] = useState(user);
  const [providers, setProviders] = useState<string[]>();
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(user.username ?? "");
  const [settingPassword, setSettingPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [confirmInput, setConfirmInput] = useState("");
  const [devices, setDevices] = useState<DeviceSession[]>();
  const [deleting, setDeleting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });

  useEffect(() => {
    void api<{ user: Identity; providers: string[] }>("/api/account")
      .then((account) => {
        setIdentity(account.user);
        setNameInput(account.user.username ?? "");
        setProviders(account.providers);
      })
      .catch((cause) =>
        setState({ status: "error", message: errorMessage(cause) }),
      );
    void api<{ sessions: DeviceSession[] }>("/api/sessions")
      .then((result) => setDevices(result.sessions))
      .catch((cause) =>
        setState({ status: "error", message: errorMessage(cause) }),
      );
  }, []);

  async function deleteAccount(event: FormEvent) {
    event.preventDefault();
    setState({ status: "loading" });
    try {
      await apiFetch("/api/account", {
        method: "DELETE",
        body: JSON.stringify({ confirmEmail }),
      });
      onSignedOut();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "challenge_failed") {
        redirectToFreshChallenge();
        return;
      }
      setState({ status: "error", message: errorMessage(cause) });
    }
  }

  async function revokeDevice(device: DeviceSession) {
    setState({ status: "loading" });
    try {
      await apiFetch(`/api/sessions/${encodeURIComponent(device.id)}`, {
        method: "DELETE",
      });
      if (device.current) {
        onSignedOut();
        return;
      }
      setDevices((current) =>
        current?.filter((entry) => entry.id !== device.id),
      );
      setState({ status: "success", message: "Device signed out." });
    } catch (cause) {
      setState({ status: "error", message: errorMessage(cause) });
    }
  }

  async function perform(path: string) {
    setState({ status: "loading" });
    try {
      await api(path, {});
      onSignedOut();
    } catch (cause) {
      setState({ status: "error", message: errorMessage(cause) });
    }
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setState({ status: "loading" });
    try {
      const result = await apiFetch<{ ok: true; user: Identity }>(
        "/api/account",
        { method: "PATCH", body: JSON.stringify({ username: nameInput }) },
      );
      setIdentity(result.user);
      setEditing(false);
      setState({ status: "success", message: "Username updated." });
    } catch (cause) {
      setState({ status: "error", message: errorMessage(cause) });
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (passwordInput !== confirmInput) {
      setState({ status: "error", message: "Passwords do not match." });
      return;
    }
    setState({ status: "loading" });
    try {
      await api("/api/account/password", {
        keys: await createAccountCredential(passwordInput),
      });
      setProviders((current) =>
        current && !current.includes("password")
          ? [...current, "password"]
          : current,
      );
      setSettingPassword(false);
      setPasswordInput("");
      setConfirmInput("");
      setState({
        status: "success",
        message: "Password set. You can now sign in with it.",
      });
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "challenge_failed") {
        redirectToFreshChallenge();
        return;
      }
      setState({ status: "error", message: errorMessage(cause) });
    }
  }

  return (
    <section className="account">
      <p className="section-label">Signed in</p>
      <Status state={state} />
      {editing ? (
        <form className="name-edit" onSubmit={saveName}>
          <Field
            label="Username"
            hint="3-20 lowercase letters, digits, or underscores."
            name="username"
            autoComplete="username"
            maxLength={20}
            value={nameInput}
            onChange={setNameInput}
          />
          <div className="name-edit-actions">
            <button
              className="primary"
              type="submit"
              disabled={state.status === "loading" || !nameInput.trim()}
            >
              Save
            </button>
            <button
              className="text-action"
              type="button"
              onClick={() => {
                setEditing(false);
                setNameInput(identity.username ?? "");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="name-row">
          <StatusLine
            model={{
              tool: "pass",
              fields: [
                { value: identity.username || identity.email, label: "" },
                { value: identity.role.toLowerCase(), label: "" },
                {
                  value: devices ? String(devices.length) : "--",
                  label: "devices",
                },
                {
                  value:
                    providers && providers.length > 0
                      ? providers.join(" ")
                      : "--",
                  label: "",
                },
              ],
            }}
          />
          <button
            className="text-action"
            type="button"
            onClick={() => {
              setState({ status: "idle" });
              setEditing(true);
            }}
          >
            Edit username
          </button>
        </div>
      )}
      <dl>
        <div>
          <dt>Email</dt>
          <dd>{identity.email}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{identity.role.toLowerCase()}</dd>
        </div>
        <div>
          <dt>Sign-in methods</dt>
          <dd>
            {providers ? (
              <span className="providers">
                {providers.map((provider) => (
                  <span key={provider}>
                    {PROVIDER_LABELS[provider] ?? provider}
                  </span>
                ))}
              </span>
            ) : (
              "..."
            )}
          </dd>
        </div>
      </dl>
      {providers && !providers.includes("password") && !settingPassword && (
        <button
          className="text-action"
          type="button"
          onClick={() => {
            setState({ status: "idle" });
            setSettingPassword(true);
          }}
        >
          Set a password for this account
        </button>
      )}
      {settingPassword && (
        <form className="name-edit" onSubmit={savePassword}>
          <Field
            label="New password"
            hint="Use at least 12 characters."
            name="new-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={passwordInput}
            onChange={setPasswordInput}
          />
          <Field
            label="Confirm password"
            name="confirm-new-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={confirmInput}
            onChange={setConfirmInput}
          />
          <div className="name-edit-actions">
            <button
              className="primary"
              type="submit"
              disabled={state.status === "loading" || !passwordInput}
            >
              Set password
            </button>
            <button
              className="text-action"
              type="button"
              onClick={() => {
                setSettingPassword(false);
                setPasswordInput("");
                setConfirmInput("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {devices && devices.length > 0 && (
        <div className="devices">
          <p className="section-label">Devices</p>
          <ul className="pw-rows">
            {devices.map((device, index) => (
              <li key={device.id}>
                <div className="pw-row row-device">
                  <span className="pw-row-state">
                    {device.current ? "current" : ""}
                  </span>
                  <span className="pw-row-title">
                    {deviceLabel(device.userAgent)}
                    <small className="pw-row-detail">
                      Signed in {new Date(device.createdAt).toLocaleString()}
                      {device.ip ? ` · ${device.ip}` : ""}
                    </small>
                  </span>
                  <span className="pw-row-age">
                    {formatAge(device.createdAt)}
                  </span>
                  <button
                    className="pw-row-tool"
                    type="button"
                    aria-label={
                      device.current
                        ? "Sign out of this device"
                        : `Revoke session ${index + 1}: ${deviceLabel(device.userAgent)}, signed in ${new Date(device.createdAt).toLocaleString()}`
                    }
                    disabled={state.status === "loading"}
                    onClick={() => void revokeDevice(device)}
                  >
                    {device.current ? "Sign out" : "Revoke"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="account-actions">
        <button
          className="primary"
          type="button"
          disabled={state.status === "loading"}
          onClick={() => void perform("/api/logout")}
        >
          Sign out
        </button>
        <button
          className="text-action"
          type="button"
          disabled={state.status === "loading"}
          onClick={() => void perform("/api/sessions/revoke-all")}
        >
          Sign out everywhere
        </button>
      </div>
      <div className="danger">
        {deleting ? (
          <form className="name-edit" onSubmit={deleteAccount}>
            <p className="danger-note">
              This permanently removes your account, links, and files. Type your
              email to confirm.
            </p>
            <Field
              label="Email"
              name="confirm-delete-email"
              type="email"
              autoComplete="off"
              value={confirmEmail}
              onChange={setConfirmEmail}
            />
            <div className="name-edit-actions">
              <button
                className="danger-action"
                type="submit"
                disabled={state.status === "loading" || !confirmEmail}
              >
                Delete forever
              </button>
              <button
                className="text-action"
                type="button"
                onClick={() => {
                  setDeleting(false);
                  setConfirmEmail("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            className="text-action danger-link"
            type="button"
            onClick={() => {
              setState({ status: "idle" });
              setDeleting(true);
            }}
          >
            Delete this account
          </button>
        )}
      </div>
    </section>
  );
}
