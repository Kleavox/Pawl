import { PW_BUTTON, PW_BUTTON_PRIMARY } from "@pawl/ui";
import type { MouseEvent, ReactNode } from "react";

import type { AppCard, CardState } from "../cabinet/card";
import { PASS_KIND } from "../machine/copy";
import type { AccessRole } from "../machine/state";

type Field = AppCard["fields"][number];

export type DeliveryFacts = {
  bay: string;
  item: string;
  place: { word: "To" | "From"; host: string };
  pass: string;
  holder: string | null;
  printed: Date;
};

export type DeliveryBody =
  | { kind: "link"; href: string; left: number | null }
  | { kind: "card"; title: string; card: CardState };

export type DeliveryActions = {
  open: (event: MouseEvent<HTMLAnchorElement>) => void;
  stay: () => void;
  copy: (field: Field) => void;
  retry: () => void;
  leave: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
};

const PRINTED_AT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  hourCycle: "h23",
});

const HEAD =
  "receipt__head grid justify-items-center gap-[10px] pb-[18px] [border-bottom:2px_dashed_var(--pw-paper-rule)] text-center";

const SERIAL =
  "receipt__serial m-0 text-pw-paper-dim font-pw-mono text-rem-label font-bold tracking-[0.18em]";

const EYEBROW =
  "m-0 text-pw-cobalt-lo font-pw-mono text-rem-label font-bold tracking-[0.18em] uppercase";

const FACTS =
  "receipt__facts grid grid-cols-[auto_minmax(0,1fr)] gap-x-[14px] gap-y-[4px] w-full m-0 mt-[6px] font-pw-mono text-rem-label text-left [&_dt]:text-pw-paper-dim [&_dt]:font-bold [&_dt]:tracking-[0.1em] [&_dt]:uppercase [&_dd]:m-0 [&_dd]:text-right [&_dd]:[overflow-wrap:anywhere]";

const BODY = "receipt__body grid gap-[12px] pt-[18px]";

const FROM =
  "m-0 pb-[6px] [border-bottom:1px_solid_var(--pw-paper-rule)] text-pw-paper-dim font-pw-mono text-rem-label font-bold tracking-[0.12em] uppercase [overflow-wrap:anywhere]";

const COUNT =
  "m-0 text-center font-pw-mono text-[3rem] font-extrabold leading-none tracking-[0.06em]";

const ACTIONS = "flex flex-wrap justify-center gap-[10px] pt-[4px]";

const FIELD = "grid gap-[4px] min-w-0";

const FIELD_HEAD = "flex items-center justify-between gap-[10px] min-w-0";

const FIELD_LABEL =
  "m-0! min-w-0 overflow-hidden text-pw-paper-dim font-pw-mono text-rem-label font-bold tracking-[0.12em] uppercase text-ellipsis whitespace-nowrap";

const VALUE =
  "m-0! min-w-0 font-pw-mono text-rem-small leading-[1.35] break-all select-all";

const COPY = `${PW_BUTTON} flex-none min-h-[36px]! px-[12px]! text-rem-small!`;

export function passLine(access: AccessRole): string {
  return PASS_KIND[access] || "GUEST";
}

function titleOf(body: DeliveryBody, item: string): string {
  if (body.kind === "link") return item;
  switch (body.card.kind) {
    case "shown":
      return body.card.card.title;
    case "connect":
      return `${body.title} needs to know who you are`;
    case "unreadable":
      return `${body.title} did not answer`;
    default:
      return body.title;
  }
}

function Facts(props: { facts: DeliveryFacts }): ReactNode {
  const { facts } = props;
  const rows: [string, string][] = [
    ["Bay", facts.bay],
    ["Item", facts.item],
    [facts.place.word, facts.place.host],
    ["Pass", facts.pass],
    ...(facts.holder === null
      ? []
      : ([["Holder", facts.holder]] as [string, string][])),
    ["Printed", PRINTED_AT.format(facts.printed)],
  ];
  return (
    <dl className={FACTS}>
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Fields(props: {
  fields: Field[];
  copied: string | null;
  onCopy: (field: Field) => void;
}): ReactNode {
  return props.fields.map((field) => (
    <div key={field.label} className={FIELD} data-card-field>
      <div className={FIELD_HEAD}>
        <p className={FIELD_LABEL}>{field.label}</p>
        {field.copy && (
          <button
            className={COPY}
            type="button"
            aria-label={
              props.copied === field.label
                ? `Copied ${field.label}`
                : `Copy ${field.label}`
            }
            onClick={() => props.onCopy(field)}
          >
            {props.copied === field.label ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <p className={VALUE} data-card-value>
        {field.value}
      </p>
    </div>
  ));
}

function LinkBody(props: {
  host: string;
  href: string;
  left: number | null;
  on: DeliveryActions;
}): ReactNode {
  return (
    <>
      {props.left === null ? (
        <p>Stopped. Open it when you are ready.</p>
      ) : (
        <>
          <p className="text-center">Opening {props.host} in</p>
          <p className={COUNT} role="timer" data-receipt-count>
            {props.left}
          </p>
        </>
      )}
      <div className={ACTIONS}>
        <a
          className={PW_BUTTON_PRIMARY}
          href={props.href}
          data-receipt-open
          onClick={props.on.open}
        >
          Open now ▸
        </a>
        {props.left !== null && (
          <button className={PW_BUTTON} type="button" onClick={props.on.stay}>
            Stay here
          </button>
        )}
      </div>
    </>
  );
}

function CardBody(props: {
  host: string;
  card: CardState;
  copied: string | null;
  on: DeliveryActions;
}): ReactNode {
  const { card, on } = props;
  switch (card.kind) {
    case "shown":
      return (
        <>
          <p className={FROM} data-receipt-from>
            From {props.host}
          </p>
          {card.card.message !== "" && (
            <p className="[overflow-wrap:anywhere]" data-card-message>
              {card.card.message}
            </p>
          )}
          <Fields
            fields={card.card.fields}
            copied={props.copied}
            onCopy={on.copy}
          />
          {card.card.action !== null && (
            <div className={ACTIONS}>
              <a
                className={PW_BUTTON_PRIMARY}
                href={card.card.action.href}
                onClick={(event) => on.leave(event, card.card.action!.href)}
              >
                {`${card.card.action.label} ↗`}
              </a>
            </div>
          )}
        </>
      );
    case "connect":
      return (
        <>
          <p>
            Pawl asks you once what it may see. You can disconnect it under
            Account → Apps.
          </p>
          <div className={ACTIONS}>
            <a
              className={PW_BUTTON_PRIMARY}
              href={card.href}
              onClick={(event) => on.leave(event, card.href)}
            >
              Connect ▸
            </a>
          </div>
        </>
      );
    case "unreadable":
      return (
        <>
          <p>Its card cannot be read right now: --</p>
          <div className={ACTIONS}>
            <button className={PW_BUTTON} type="button" onClick={on.retry}>
              Try again
            </button>
          </div>
        </>
      );
    default:
      return <p>One moment</p>;
  }
}

export function Delivery(props: {
  siteName: string;
  facts: DeliveryFacts;
  body: DeliveryBody;
  copied: string | null;
  on: DeliveryActions;
}): ReactNode {
  const { body, facts } = props;
  const connecting = body.kind === "card" && body.card.kind === "connect";
  return (
    <>
      <div className={HEAD}>
        <p className={SERIAL}>PAWL-GW-01 · {props.siteName.toUpperCase()}</p>
        {connecting && <p className={EYEBROW}>First time</p>}
        <h1 id="delivery-title" className="[overflow-wrap:anywhere]">
          {titleOf(body, facts.item)}
        </h1>
        <Facts facts={facts} />
      </div>
      <section className={BODY} aria-labelledby="delivery-title">
        {body.kind === "link" ? (
          <LinkBody
            host={facts.place.host}
            href={body.href}
            left={body.left}
            on={props.on}
          />
        ) : (
          <CardBody
            host={facts.place.host}
            card={body.card}
            copied={props.copied}
            on={props.on}
          />
        )}
      </section>
    </>
  );
}
