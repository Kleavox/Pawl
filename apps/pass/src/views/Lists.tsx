import { apiFetch } from "@pawl/core";
import {
  formatAge,
  Kbd,
  Loader,
  Note,
  PW_LINK,
  Title,
  ViewButton,
} from "@pawl/ui";
import { useEffect, useRef, type ReactNode } from "react";

import { pageOf, type PassView } from "../flow";
import { deviceLabel } from "../helpers";
import type { ConnectedApp, DeviceSession } from "../types";
import {
  begin,
  failed,
  Frame,
  signedOut,
  signOutVia,
  usePass,
  type Pass,
} from "./context";

const ROWS = "grid gap-6 w-full m-0 p-0 list-none";

export const ROW =
  "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-12 min-h-50 px-12 py-4 border-[length:--spacing(1)] border-solid border-pw-screen-edge rounded-[--spacing(8)] bg-pw-screen-hi max-desk:gap-8 max-desk:min-h-46";

export const ROW_TITLE =
  "min-w-0 overflow-hidden text-pw-ink text-15 font-semibold text-ellipsis whitespace-nowrap";

export const ROW_DETAIL =
  "block overflow-hidden text-pw-ink-dim text-14 font-normal text-ellipsis whitespace-nowrap";

export const ROW_AGE = "text-pw-ink-dim font-pw-mono text-14";

export const ROW_TOOL =
  "h-34 px-12 border-[length:--spacing(1)] border-solid border-pw-screen-edge rounded-[--spacing(6)] bg-transparent text-pw-ice font-pw-ui text-14 font-bold cursor-pointer hover:border-pw-cobalt-hi disabled:opacity-55 data-current:border-pw-warn data-current:text-pw-warn";

const PAGER =
  "flex items-center justify-between gap-12 w-full text-pw-ink-dim font-pw-mono text-14";

function Pager(props: {
  page: number;
  pages: number;
  active: boolean;
  onStep: (step: 1 | -1) => void;
}): ReactNode {
  const step = useRef(props.onStep);
  step.current = props.onStep;
  useEffect(() => {
    if (!props.active) return;
    const key = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (event.key === "ArrowLeft") step.current(-1);
      if (event.key === "ArrowRight") step.current(1);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [props.active]);
  return (
    <div className={PAGER}>
      <button
        className={PW_LINK}
        type="button"
        disabled={props.page === 0}
        onClick={() => props.onStep(-1)}
      >
        ‹ Previous
      </button>
      <span>{`Page ${props.page + 1} of ${props.pages}`}</span>
      <button
        className={PW_LINK}
        type="button"
        disabled={props.page >= props.pages - 1}
        onClick={() => props.onStep(1)}
      >
        Next ›
      </button>
    </div>
  );
}

export function Paged<T>(props: {
  view: PassView;
  items: readonly T[];
  row: (item: T, index: number) => ReactNode;
}): ReactNode {
  const pass = usePass();
  const { rows, page, pages } = pageOf(props.items, pass.state.page);
  return (
    <>
      <ul className={ROWS}>
        {rows.map((item, index) => props.row(item, page * 3 + index))}
      </ul>
      <Pager
        page={page}
        pages={pages}
        active={pass.state.view === props.view}
        onStep={(step) => pass.dispatch({ type: "page", step, total: pages })}
      />
    </>
  );
}

function SectionFrame(props: {
  name: PassView;
  title: string;
  children: ReactNode;
}): ReactNode {
  return (
    <Frame
      name={props.name}
      labelledBy={`${props.name}-title`}
      tells
      foot={
        <>
          <Kbd>←</Kbd>
          <Kbd>→</Kbd> page · <Kbd>CLR</Kbd> back
        </>
      }
    >
      <Title id={`${props.name}-title`}>{props.title}</Title>
      {props.children}
    </Frame>
  );
}

function done(pass: Pass, text: string): void {
  pass.dispatch({ type: "busy", busy: false });
  pass.dispatch({ type: "say", say: { kind: "success", text } });
}

export function Unread(props: {
  text: string;
  onRetry: () => void;
}): ReactNode {
  return (
    <Note tone="tries">
      <span>{props.text}</span>{" "}
      <button className={PW_LINK} type="button" onClick={props.onRetry}>
        Try again
      </button>
    </Note>
  );
}

export function DevicesStep(props: {
  devices: DeviceSession[] | undefined;
  failed: string | null;
  onRetry: () => void;
  onDevices: (devices: DeviceSession[]) => void;
}): ReactNode {
  const pass = usePass();
  const { devices } = props;

  async function revoke(device: DeviceSession): Promise<void> {
    begin(pass);
    try {
      await apiFetch(`/api/sessions/${encodeURIComponent(device.id)}`, {
        method: "DELETE",
      });
      if (device.current) {
        signedOut(pass);
        return;
      }
      props.onDevices(
        (devices ?? []).filter((entry) => entry.id !== device.id),
      );
      done(pass, "Device signed out.");
    } catch (cause) {
      failed(pass, cause);
    }
  }

  return (
    <SectionFrame name="devices" title="Devices">
      {devices === undefined ? (
        props.failed === null ? (
          <Loader />
        ) : (
          <Unread text={props.failed} onRetry={props.onRetry} />
        )
      ) : devices.length === 0 ? (
        <Note tone="line">No device holds your pass.</Note>
      ) : (
        <Paged
          view="devices"
          items={devices}
          row={(device, index) => {
            const when = new Date(device.createdAt).toLocaleString();
            const label = deviceLabel(device.userAgent);
            return (
              <li key={device.id} className={ROW} data-device-row>
                <span className={ROW_TITLE}>
                  {label}
                  <small className={ROW_DETAIL}>
                    {device.current ? "This device · " : ""}
                    Signed in {when}
                    {device.ip ? ` · ${device.ip}` : ""}
                  </small>
                </span>
                <span className={ROW_AGE}>{formatAge(device.createdAt)}</span>
                <button
                  className={ROW_TOOL}
                  type="button"
                  data-current={device.current ? "" : undefined}
                  aria-label={
                    device.current
                      ? "Sign out of this device"
                      : `Revoke session ${index + 1}: ${label}, signed in ${when}`
                  }
                  disabled={pass.state.busy}
                  onClick={() => void revoke(device)}
                >
                  {device.current ? "Sign out" : "Revoke"}
                </button>
              </li>
            );
          }}
        />
      )}
    </SectionFrame>
  );
}

export function AppsStep(props: {
  apps: ConnectedApp[] | undefined;
  failed: string | null;
  onRetry: () => void;
  onApps: (apps: ConnectedApp[]) => void;
}): ReactNode {
  const pass = usePass();
  const { apps } = props;

  async function disconnect(app: ConnectedApp): Promise<void> {
    begin(pass);
    try {
      await apiFetch(
        `/api/account/grants/${encodeURIComponent(app.clientId)}`,
        { method: "DELETE" },
      );
      props.onApps(
        (apps ?? []).filter((entry) => entry.clientId !== app.clientId),
      );
      done(pass, `${app.name} disconnected.`);
    } catch (cause) {
      failed(pass, cause);
    }
  }

  return (
    <SectionFrame name="apps" title="Apps">
      {apps === undefined ? (
        props.failed === null ? (
          <Loader />
        ) : (
          <Unread text={props.failed} onRetry={props.onRetry} />
        )
      ) : apps.length === 0 ? (
        <Note tone="line">No outside app holds your pass yet.</Note>
      ) : (
        <Paged
          view="apps"
          items={apps}
          row={(app) => (
            <li key={app.clientId} className={ROW} data-app-row>
              <span className={ROW_TITLE}>
                {app.name}
                <small className={ROW_DETAIL}>
                  {app.sector} · reads {app.scopes.join(", ")}
                </small>
              </span>
              <span className={ROW_AGE}>{formatAge(app.createdAt)}</span>
              <button
                className={ROW_TOOL}
                type="button"
                aria-label={`Disconnect ${app.name}`}
                disabled={pass.state.busy}
                onClick={() => void disconnect(app)}
              >
                Disconnect
              </button>
            </li>
          )}
        />
      )}
    </SectionFrame>
  );
}
