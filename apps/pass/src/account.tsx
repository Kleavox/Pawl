import { ApiError, apiFetch, displayHandle, errorMessage } from "@pawl/core";
import type { Identity } from "@pawl/core";
import { createAccountCredential } from "@pawl/crypto";
import { formatAge } from "@pawl/ui";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { api, deviceLabel, redirectToFreshChallenge } from "./helpers";
import { SCREEN_FORM } from "./machine";
import type { ConnectedApp, DeviceSession, FormState } from "./types";
import { Field, Status, guarded } from "./ui";

const PROVIDER_LABELS: Record<string, string> = {
  password: "Password",
  google: "Google",
  github: "GitHub",
};

const TABS = ["profile", "devices", "apps", "security"] as const;
export type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  profile: "Profile",
  devices: "Devices",
  apps: "Apps",
  security: "Security",
};

function TabBar({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length]!;
    onTab(next);
    buttons.current[TABS.indexOf(next)]?.focus();
  }

  return (
    <div
      className="pw-tabs account__tabs"
      role="tablist"
      aria-label="Account"
      onKeyDown={move}
    >
      {TABS.map((entry, index) => (
        <button
          key={entry}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          className="pw-tab"
          type="button"
          role="tab"
          id={`tab-${entry}`}
          aria-selected={entry === tab}
          aria-controls={`panel-${entry}`}
          tabIndex={entry === tab ? 0 : -1}
          onClick={() => onTab(entry)}
        >
          {TAB_LABELS[entry]}
        </button>
      ))}
    </div>
  );
}

export function Account({
  user,
  tab,
  onTab,
  onGo,
  onSignedOut,
}: {
  user: Identity;
  tab: Tab;
  onTab: (tab: Tab) => void;
  onGo: (ready: boolean) => void;
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
  const [connected, setConnected] = useState<ConnectedApp[]>();
  const [deleting, setDeleting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });

  const formOpen =
    (tab === "profile" && (editing || settingPassword)) ||
    (tab === "security" && deleting);

  useEffect(() => {
    onGo(formOpen);
  }, [formOpen, onGo]);

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
    void api<{ grants: ConnectedApp[] }>("/api/account/grants")
      .then((result) => setConnected(result.grants))
      .catch((cause) =>
        setState({ status: "error", message: errorMessage(cause) }),
      );
  }, []);

  function choose(next: Tab) {
    setState({ status: "idle" });
    onTab(next);
  }

  async function disconnect(app: ConnectedApp) {
    setState({ status: "loading" });
    try {
      await apiFetch(
        `/api/account/grants/${encodeURIComponent(app.clientId)}`,
        { method: "DELETE" },
      );
      setConnected((current) =>
        current?.filter((entry) => entry.clientId !== app.clientId),
      );
      setState({ status: "success", message: `${app.name} disconnected.` });
    } catch (cause) {
      setState({ status: "error", message: errorMessage(cause) });
    }
  }

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

  const busy = state.status === "loading";
  const role = identity.role === "ADMIN" ? "Owner" : "Visitor";

  return (
    <section className="account" aria-labelledby="account-holder">
      <div className="account__head">
        <p className="pw-eyebrow is-ok">Pass holder</p>
        <h2 className="pw-heading" id="account-holder">
          {displayHandle(identity.username, identity.email)}
        </h2>
        <p className="pw-text account__line">
          {identity.email} · {role} pass
        </p>
      </div>
      <TabBar tab={tab} onTab={choose} />
      <Status state={state} />

      <div
        className="account__panel"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === "profile" && (
          <>
            {editing ? (
              <form
                id={SCREEN_FORM}
                className="account__form"
                onSubmit={guarded(busy, saveName)}
              >
                <Field
                  label="Username"
                  hint="3-20 lowercase letters, digits, or underscores."
                  name="username"
                  autoComplete="username"
                  maxLength={20}
                  value={nameInput}
                  onChange={setNameInput}
                />
                <div className="account__actions">
                  <button
                    className="pw-button pw-button-primary"
                    type="submit"
                    disabled={busy || !nameInput.trim()}
                  >
                    Save
                  </button>
                  <button
                    className="pw-button"
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
            ) : null}
            <dl className="account__facts">
              <div>
                <dt>Username</dt>
                <dd>
                  {identity.username ?? "—"}
                  {!editing && !settingPassword && (
                    <button
                      className="pw-link"
                      type="button"
                      onClick={() => {
                        setState({ status: "idle" });
                        setEditing(true);
                      }}
                    >
                      Edit username
                    </button>
                  )}
                </dd>
              </div>
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
                    "--"
                  )}
                </dd>
              </div>
            </dl>
            {providers &&
              !providers.includes("password") &&
              !settingPassword &&
              !editing && (
                <button
                  className="pw-link"
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
              <form
                id={SCREEN_FORM}
                className="account__form"
                onSubmit={guarded(busy, savePassword)}
              >
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
                <div className="account__actions">
                  <button
                    className="pw-button pw-button-primary"
                    type="submit"
                    disabled={busy || !passwordInput}
                  >
                    Set password
                  </button>
                  <button
                    className="pw-button"
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
          </>
        )}

        {tab === "devices" && (
          <>
            <p className="pw-text">
              Every browser holding your pass. Each one lasts 7 days unless you
              sign it out here.
            </p>
            {devices === undefined ? (
              <div className="pw-loading" aria-label="Loading devices">
                <span />
                <span />
              </div>
            ) : (
              <ul className="pw-rows">
                {devices.map((device, index) => (
                  <li key={device.id}>
                    <div className="pw-row row-device">
                      <span
                        className={
                          device.current
                            ? "pw-row-state"
                            : "pw-row-state is-off"
                        }
                      >
                        {device.current ? "current" : ""}
                      </span>
                      <span className="pw-row-title">
                        {deviceLabel(device.userAgent)}
                        <small className="pw-row-detail">
                          {device.current ? "This device · " : ""}
                          Signed in{" "}
                          {new Date(device.createdAt).toLocaleString()}
                          {device.ip ? ` · ${device.ip}` : ""}
                        </small>
                      </span>
                      <span className="pw-row-age">
                        {formatAge(device.createdAt)}
                      </span>
                      <button
                        className={
                          device.current
                            ? "pw-row-tool is-current"
                            : "pw-row-tool"
                        }
                        type="button"
                        aria-label={
                          device.current
                            ? "Sign out of this device"
                            : `Revoke session ${index + 1}: ${deviceLabel(device.userAgent)}, signed in ${new Date(device.createdAt).toLocaleString()}`
                        }
                        disabled={busy}
                        onClick={() => void revokeDevice(device)}
                      >
                        {device.current ? "Sign out" : "Revoke"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="account__actions">
              <button
                className="pw-button"
                type="button"
                disabled={busy}
                onClick={() => void perform("/api/sessions/revoke-all")}
              >
                Sign out everywhere
              </button>
            </div>
          </>
        )}

        {tab === "apps" && (
          <>
            <p className="pw-text">
              Outside apps you allowed to sign you in. Apps of this machine do
              not appear here; they never ask.
            </p>
            {connected === undefined ? (
              <div className="pw-loading" aria-label="Loading apps">
                <span />
                <span />
              </div>
            ) : connected.length === 0 ? (
              <p className="pw-status is-info">
                No outside app holds your pass yet.
              </p>
            ) : (
              <ul className="pw-rows">
                {connected.map((app) => (
                  <li key={app.clientId}>
                    <div className="pw-row row-device">
                      <span className="pw-row-state">{app.sector}</span>
                      <span className="pw-row-title">
                        {app.name}
                        <small className="pw-row-detail">
                          {app.sector} · reads {app.scopes.join(", ")} ·
                          connected {new Date(app.createdAt).toLocaleString()}
                        </small>
                      </span>
                      <span className="pw-row-age">
                        {formatAge(app.createdAt)}
                      </span>
                      <button
                        className="pw-row-tool"
                        type="button"
                        aria-label={`Disconnect ${app.name}`}
                        disabled={busy}
                        onClick={() => void disconnect(app)}
                      >
                        Disconnect
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === "security" && (
          <>
            <div className="account__actions">
              <button
                className="pw-button pw-button-primary"
                type="button"
                disabled={busy}
                onClick={() => void perform("/api/logout")}
              >
                Sign out
              </button>
              <button
                className="pw-button"
                type="button"
                disabled={busy}
                onClick={() => void perform("/api/sessions/revoke-all")}
              >
                Sign out everywhere
              </button>
            </div>
            <div className="account__danger">
              <p className="pw-eyebrow is-danger">Danger zone</p>
              {deleting ? (
                <form
                  id={SCREEN_FORM}
                  className="account__form"
                  onSubmit={guarded(busy, deleteAccount)}
                >
                  <p className="pw-text">
                    This deletes your account, its keys, sessions and app
                    grants, and asks every app that keeps data for it to erase
                    it. Type your email to confirm.
                  </p>
                  <Field
                    label="Email"
                    name="confirm-delete-email"
                    type="email"
                    autoComplete="off"
                    value={confirmEmail}
                    onChange={setConfirmEmail}
                  />
                  <div className="account__actions">
                    <button
                      className="pw-button pw-button-danger"
                      type="submit"
                      disabled={busy || !confirmEmail}
                    >
                      Delete forever
                    </button>
                    <button
                      className="pw-button"
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
                  className="pw-button pw-button-danger"
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
          </>
        )}
      </div>
    </section>
  );
}
