import { apiFetch, errorMessage } from "@pawl/core";
import {
  Actions,
  Back,
  Field,
  Form,
  formatAge,
  Kbd,
  Loader,
  Note,
  PW_LINK,
  Title,
  ViewButton,
} from "@pawl/ui";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { api } from "../helpers";
import {
  begin,
  failed,
  Frame,
  SCREEN_FORM,
  useFollowEnd,
  usePass,
  type Pass,
} from "./context";
import {
  Paged,
  ROW,
  ROW_AGE,
  ROW_DETAIL,
  ROW_TITLE,
  ROW_TOOL,
  Unread,
} from "./Lists";

type Access = "public" | "visitor" | "owner";

type OutsideApp = {
  key: string;
  label: string;
  title: string;
  origin: string;
  access: Access;
  card: boolean;
  clientId: string;
  redirectUri: string;
  createdAt: string;
};

type Draft = {
  title: string;
  address: string;
  label: string;
  access: Access;
  returnTo: string;
  card: boolean;
};

const EMPTY: Draft = {
  title: "",
  address: "",
  label: "",
  access: "visitor",
  returnTo: "",
  card: true,
};

const WHO: readonly { access: Access; word: string }[] = [
  { access: "public", word: "Anyone" },
  { access: "visitor", word: "Visitors" },
  { access: "owner", word: "Owner" },
];

const WHO_ROW = "flex flex-wrap gap-8";

const HEAD = "flex items-center justify-between gap-12 w-full m-0";

const WHO_BUTTON =
  "h-34 px-12 border-[length:--spacing(1)] border-solid border-pw-screen-edge rounded-[--spacing(6)] bg-transparent text-pw-ice font-pw-ui text-14 font-bold cursor-pointer hover:border-pw-cobalt-hi aria-pressed:border-pw-cobalt-hi aria-pressed:bg-pw-cobalt aria-pressed:text-pw-white";

const WHO_LABEL =
  "view__label text-pw-ice font-pw-mono text-14 font-bold tracking-[0.14em] uppercase";

const CHECK =
  "flex items-center gap-10 text-pw-ink font-pw-ui text-15 font-semibold cursor-pointer";

const CHECK_BOX = "size-20 accent-pw-cobalt";

const SECRETS = "grid gap-8 w-full m-0 max-desk:gap-5";

const SECRET = "grid gap-4 min-w-0";

const SECRET_VALUE =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-10 m-0 max-desk:gap-6";

const SECRET_TEXT =
  "min-w-0 text-pw-ink font-pw-mono text-14 leading-[1.3] break-all select-all";

const COPIED_MS = 1500;

function labelFrom(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^[^a-z]+/u, "")
    .slice(0, 12)
    .replace(/-+$/u, "");
}

function originFrom(address: string): string {
  return address.trim().replace(/\/+$/u, "");
}

function whoWord(access: Access): string {
  return WHO.find((entry) => entry.access === access)?.word ?? access;
}

function said(pass: Pass, text: string): void {
  pass.dispatch({ type: "busy", busy: false });
  pass.dispatch({ type: "say", say: { kind: "success", text } });
}

function BackTo(props: { label: string }): ReactNode {
  const pass = usePass();
  return (
    <Back label={props.label} onClick={() => pass.dispatch({ type: "back" })} />
  );
}

function Copyable(props: {
  label: string;
  value: string;
  copied: string | null;
  onCopy: (label: string, value: string) => void;
}): ReactNode {
  return (
    <div className={SECRET}>
      <dt className={WHO_LABEL}>{props.label}</dt>
      <dd className={SECRET_VALUE}>
        <span className={SECRET_TEXT}>{props.value}</span>
        <button
          className={ROW_TOOL}
          type="button"
          aria-label={
            props.copied === props.label
              ? `Copied ${props.label}`
              : `Copy ${props.label}`
          }
          onClick={() => props.onCopy(props.label, props.value)}
        >
          {props.copied === props.label ? "Copied" : "Copy"}
        </button>
      </dd>
    </div>
  );
}

function ListStep(props: {
  apps: OutsideApp[] | undefined;
  failed: string | null;
  onRetry: () => void;
  onRemove: (app: OutsideApp) => void;
  onNew: () => void;
}): ReactNode {
  const pass = usePass();
  return (
    <Frame
      name="registry"
      where="REGISTERED APPS"
      step="5 OF 5"
      labelledBy="registry-title"
      tells
      foot={
        <>
          <Kbd go>GO</Kbd> new app · <Kbd>CLR</Kbd> back
        </>
      }
      back={<BackTo label="Account" />}
    >
      <form
        id={pass.state.view === "registry" ? SCREEN_FORM : undefined}
        className={HEAD}
        onSubmit={(event) => {
          event.preventDefault();
          props.onNew();
        }}
      >
        <Title id="registry-title">Registered apps</Title>
        <button className={PW_LINK} type="submit" disabled={pass.state.busy}>
          New app
        </button>
      </form>
      {props.apps === undefined ? (
        props.failed === null ? (
          <Loader />
        ) : (
          <Unread text={props.failed} onRetry={props.onRetry} />
        )
      ) : props.apps.length === 0 ? (
        <Note tone="line">No outside app is registered yet.</Note>
      ) : (
        <Paged
          view="registry"
          items={props.apps}
          row={(app) => (
            <li key={app.key} className={ROW} data-registry-row>
              <span className={ROW_TITLE}>
                {app.title}
                <small className={ROW_DETAIL}>
                  {`${app.origin} · ${whoWord(app.access)}${app.card ? " · card" : ""}`}
                </small>
              </span>
              <span className={ROW_AGE}>{formatAge(app.createdAt)}</span>
              <button
                className={ROW_TOOL}
                type="button"
                aria-label={`Remove ${app.title}`}
                disabled={pass.state.busy}
                onClick={() => props.onRemove(app)}
              >
                Remove
              </button>
            </li>
          )}
        />
      )}
    </Frame>
  );
}

function NameStep(props: {
  draft: Draft;
  onDraft: (draft: Draft) => void;
}): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "registry-name";
  const { draft } = props;

  function next(event: FormEvent): void {
    event.preventDefault();
    if (draft.title.trim() === "" || draft.address.trim() === "") {
      pass.dispatch({
        type: "say",
        say: { kind: "error", text: "Give the app a name and its address." },
      });
      return;
    }
    props.onDraft({
      ...draft,
      label: draft.label === "" ? labelFrom(draft.title) : draft.label,
    });
    pass.dispatch({ type: "open", view: "registry-label" });
  }

  return (
    <Frame
      name="registry-name"
      where="NEW APP"
      step="1 OF 3"
      labelledBy="registry-name-title"
      foot={
        <>
          <Kbd go>GO</Kbd> next · <Kbd>CLR</Kbd> back
        </>
      }
      back={<BackTo label="Registered apps" />}
    >
      <Title id="registry-name-title">Name and address</Title>
      <Form id={shown ? SCREEN_FORM : undefined} onSubmit={next}>
        <Field
          label="Name"
          id="registry-app-title"
          name="title"
          autoComplete="off"
          maxLength={32}
          value={draft.title}
          onChange={(event) =>
            props.onDraft({ ...draft, title: event.target.value })
          }
          data-autofocus
        />
        <Field
          label="Address"
          id="registry-app-address"
          name="address"
          type="url"
          autoComplete="off"
          placeholder="https://app.example"
          value={draft.address}
          onChange={(event) =>
            props.onDraft({ ...draft, address: event.target.value })
          }
        />
      </Form>
    </Frame>
  );
}

function LabelStep(props: {
  draft: Draft;
  onDraft: (draft: Draft) => void;
}): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "registry-label";
  const { draft } = props;

  function next(event: FormEvent): void {
    event.preventDefault();
    if (draft.label.trim() === "") {
      pass.dispatch({
        type: "say",
        say: { kind: "error", text: "Give the cartridge a label." },
      });
      return;
    }
    props.onDraft({
      ...draft,
      returnTo:
        draft.returnTo === ""
          ? `${originFrom(draft.address)}/auth/callback`
          : draft.returnTo,
    });
    pass.dispatch({ type: "open", view: "registry-return" });
  }

  return (
    <Frame
      name="registry-label"
      where="NEW APP"
      step="2 OF 3"
      labelledBy="registry-label-title"
      foot={
        <>
          <Kbd go>GO</Kbd> next · <Kbd>CLR</Kbd> back
        </>
      }
      back={<BackTo label="Name and address" />}
    >
      <Title id="registry-label-title">On the cabinet</Title>
      <Form id={shown ? SCREEN_FORM : undefined} onSubmit={next}>
        <Field
          label="Label on the cartridge"
          id="registry-app-label"
          name="label"
          autoComplete="off"
          maxLength={12}
          value={draft.label}
          onChange={(event) =>
            props.onDraft({ ...draft, label: event.target.value })
          }
          data-autofocus
        />
        <span className={WHO_LABEL} id="registry-who">
          Who may take it
        </span>
        <span className={WHO_ROW} role="group" aria-labelledby="registry-who">
          {WHO.map((entry) => (
            <button
              key={entry.access}
              className={WHO_BUTTON}
              type="button"
              aria-pressed={draft.access === entry.access}
              onClick={() => props.onDraft({ ...draft, access: entry.access })}
            >
              {entry.word}
            </button>
          ))}
        </span>
      </Form>
    </Frame>
  );
}

function ReturnStep(props: {
  draft: Draft;
  onDraft: (draft: Draft) => void;
  onCreated: (app: OutsideApp, secret: string) => void;
}): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "registry-return";
  const { draft } = props;

  async function create(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (pass.state.busy) return;
    begin(pass);
    try {
      const created = await apiFetch<{ app: OutsideApp; secret: string }>(
        "/api/admin/apps",
        {
          method: "POST",
          body: JSON.stringify({
            title: draft.title.trim(),
            label: draft.label.trim(),
            address: originFrom(draft.address),
            returnTo: draft.returnTo.trim(),
            access: draft.access,
            card: draft.card,
          }),
        },
      );
      pass.dispatch({ type: "busy", busy: false });
      props.onCreated(created.app, created.secret);
    } catch (cause) {
      failed(pass, cause);
    }
  }

  return (
    <Frame
      name="registry-return"
      where="NEW APP"
      step="3 OF 3"
      labelledBy="registry-return-title"
      foot={
        <>
          <Kbd go>GO</Kbd> register · <Kbd>CLR</Kbd> back
        </>
      }
      back={<BackTo label="On the cabinet" />}
    >
      <Title id="registry-return-title">Sign-in and card</Title>
      <Form
        id={shown ? SCREEN_FORM : undefined}
        onSubmit={(event) => void create(event)}
      >
        <Field
          label="Return address"
          id="registry-app-return"
          name="returnTo"
          type="url"
          autoComplete="off"
          value={draft.returnTo}
          onChange={(event) =>
            props.onDraft({ ...draft, returnTo: event.target.value })
          }
          data-autofocus
        />
        <label className={CHECK}>
          <input
            className={CHECK_BOX}
            type="checkbox"
            checked={draft.card}
            onChange={(event) =>
              props.onDraft({ ...draft, card: event.target.checked })
            }
          />
          Shows a card on the cabinet
        </label>
      </Form>
      <Note aside>
        Change the return address only for an app behind Cloudflare Access.
      </Note>
    </Frame>
  );
}

function SecretStep(props: {
  created: { app: OutsideApp; secret: string } | null;
}): ReactNode {
  const pass = usePass();
  const [copied, setCopied] = useState<string | null>(null);

  function copy(label: string, value: string): void {
    const clipboard = globalThis.navigator?.clipboard;
    const refused = (): void =>
      pass.dispatch({
        type: "say",
        say: {
          kind: "error",
          text: "Copy did not work here. Select the text and copy it yourself.",
        },
      });
    if (clipboard === undefined) {
      refused();
      return;
    }
    clipboard.writeText(value).then(() => {
      setCopied(label);
      setTimeout(
        () => setCopied((now) => (now === label ? null : now)),
        COPIED_MS,
      );
    }, refused);
  }

  return (
    <Frame
      name="registry-secret"
      where="NEW APP"
      step="SECRET"
      labelledBy="registry-secret-title"
      foot={
        <>
          <Kbd>CLR</Kbd> registered apps
        </>
      }
      back={<BackTo label="Registered apps" />}
    >
      <Title id="registry-secret-title">Copy the secret now</Title>
      <Note aside>It is not shown again. Put both in the app's settings.</Note>
      {props.created !== null && (
        <dl className={SECRETS}>
          <Copyable
            label="Client ID"
            value={props.created.app.clientId}
            copied={copied}
            onCopy={copy}
          />
          <Copyable
            label="Secret"
            value={props.created.secret}
            copied={copied}
            onCopy={copy}
          />
        </dl>
      )}
    </Frame>
  );
}

function RemoveStep(props: {
  app: OutsideApp | null;
  onRemoved: (app: OutsideApp) => void;
}): ReactNode {
  const pass = usePass();
  const shown = pass.state.view === "registry-remove";
  const title = props.app?.title ?? "";

  async function remove(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (pass.state.busy || props.app === null) return;
    begin(pass);
    try {
      await apiFetch(`/api/admin/apps/${encodeURIComponent(props.app.key)}`, {
        method: "DELETE",
      });
      props.onRemoved(props.app);
    } catch (cause) {
      failed(pass, cause);
    }
  }

  return (
    <Frame
      name="registry-remove"
      where="REGISTERED APPS"
      step="REMOVE"
      labelledBy="registry-remove-title"
      foot={
        <>
          <Kbd go>GO</Kbd> remove · <Kbd>CLR</Kbd> back
        </>
      }
      back={<BackTo label="Registered apps" />}
    >
      <Title id="registry-remove-title">{`Remove ${title}?`}</Title>
      <Note>
        Everyone connected to it is disconnected, and its bay leaves the
        cabinet.
      </Note>
      <Form
        id={shown ? SCREEN_FORM : undefined}
        onSubmit={(event) => void remove(event)}
      >
        <Actions>
          <ViewButton tone="danger" type="submit" disabled={pass.state.busy}>
            Remove
          </ViewButton>
        </Actions>
      </Form>
    </Frame>
  );
}

export function RegistrySteps(): ReactNode {
  const pass = usePass();
  const [apps, setApps] = useState<OutsideApp[]>();
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [created, setCreated] = useState<{
    app: OutsideApp;
    secret: string;
  } | null>(null);
  const [removing, setRemoving] = useState<OutsideApp | null>(null);

  const follow = useFollowEnd();
  const reload = useCallback((): void => {
    setLoadFailed(null);
    void api<{ apps: OutsideApp[] }>("/api/admin/apps")
      .then((body) => setApps(body.apps))
      .catch((cause) => {
        if (!follow(cause)) setLoadFailed(errorMessage(cause));
      });
  }, [follow]);
  useEffect(reload, [reload]);

  return (
    <>
      <ListStep
        apps={apps}
        failed={loadFailed}
        onRetry={reload}
        onRemove={(app) => {
          setRemoving(app);
          pass.dispatch({ type: "open", view: "registry-remove" });
        }}
        onNew={() => {
          setDraft(EMPTY);
          pass.dispatch({ type: "open", view: "registry-name" });
        }}
      />
      <NameStep draft={draft} onDraft={setDraft} />
      <LabelStep draft={draft} onDraft={setDraft} />
      <ReturnStep
        draft={draft}
        onDraft={setDraft}
        onCreated={(app, secret) => {
          setCreated({ app, secret });
          setApps((current) => [...(current ?? []), app]);
          pass.dispatch({ type: "open", view: "registry-secret" });
        }}
      />
      <SecretStep created={created} />
      <RemoveStep
        app={removing}
        onRemoved={(app) => {
          setApps((current) =>
            (current ?? []).filter((entry) => entry.key !== app.key),
          );
          pass.dispatch({ type: "open", view: "registry" });
          said(pass, `${app.title} removed.`);
        }}
      />
    </>
  );
}
