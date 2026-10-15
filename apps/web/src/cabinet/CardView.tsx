import {
  Back,
  Bar,
  BarAction,
  BarLink,
  Body,
  Eyebrow,
  Foot,
  Kbd,
  Loader,
  Note,
  Say,
  Title,
  View,
} from "@pawl/ui";
import type { MouseEvent, ReactNode } from "react";

import { cardStep, type AppCard, type CardState } from "./card";

type Field = AppCard["fields"][number];

const FIELDS = "card__fields grid gap-8 w-full m-0 max-desk:gap-5";

const FIELD = "card__field grid gap-4 min-w-0";

const FIELD_HEAD =
  "flex items-center justify-between gap-10 min-w-0 max-desk:gap-6";

const FIELD_LABEL =
  "m-0 min-w-0 overflow-hidden text-pw-ice font-pw-mono text-14 font-bold tracking-[0.14em] uppercase text-ellipsis whitespace-nowrap";

const VALUE =
  "m-0 min-w-0 text-pw-ink font-pw-mono text-14 leading-[1.3] break-all select-all";

const COPY =
  "flex-none h-26 px-10 border-[length:--spacing(1)] border-solid border-pw-screen-edge rounded-[--spacing(6)] bg-transparent text-pw-ice font-pw-ui text-14 font-bold leading-none cursor-pointer hover:border-pw-cobalt-hi";

export type CardViewProps = {
  hidden: boolean;
  bay: { code: string; title: string; product: string } | null;
  state: CardState;
  said: string;
  copied: string | null;
  leaving?: boolean;
  on: {
    leave: (event: MouseEvent<HTMLAnchorElement>) => void;
    retry: () => void;
    signIn: () => void;
    copy: (field: Field) => void;
    back: () => void;
  };
};

function Fields(props: {
  fields: Field[];
  copied: string | null;
  onCopy: (field: Field) => void;
}): ReactNode {
  if (props.fields.length === 0) return null;
  return (
    <div className={FIELDS}>
      {props.fields.map((field) => (
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
      ))}
    </div>
  );
}

function Content(props: CardViewProps & { title: string }): ReactNode {
  const { state, title } = props;
  switch (state.kind) {
    case "connect":
      return (
        <>
          <Eyebrow>First time</Eyebrow>
          <Title id="view-card-title">{`${title} needs to know who you are`}</Title>
          <Note aside>
            Pawl asks you once what it may see. You can disconnect it under
            Account → Apps.
          </Note>
        </>
      );
    case "shown":
      return (
        <>
          <Title id="view-card-title">{state.card.title}</Title>
          {state.card.message !== "" && (
            <Note aside data-card-message>
              {state.card.message}
            </Note>
          )}
          <Fields
            fields={state.card.fields}
            copied={props.copied}
            onCopy={props.on.copy}
          />
        </>
      );
    case "unreadable":
      return (
        <>
          <Eyebrow>No answer</Eyebrow>
          <Title id="view-card-title">{`${title} did not answer`}</Title>
          <Note>Its card cannot be read right now: --</Note>
        </>
      );
    case "expired":
      return (
        <>
          <Eyebrow>Signed out</Eyebrow>
          <Title id="view-card-title">Your sign-in ended</Title>
        </>
      );
    default:
      return (
        <>
          <Eyebrow>One moment</Eyebrow>
          <Title id="view-card-title">{title}</Title>
          <Loader />
        </>
      );
  }
}

function Step(props: CardViewProps): ReactNode {
  const { state, on } = props;
  const step = cardStep(state);
  if (step === null) return null;
  if (step.kind === "leave") {
    return (
      <BarLink
        href={step.href}
        leaving={props.leaving}
        onClick={on.leave}
        data-card-go
      >
        {`${step.word} ▸`}
      </BarLink>
    );
  }
  return (
    <BarAction
      onClick={step.kind === "retry" ? on.retry : on.signIn}
      data-card-go
    >
      {step.word}
    </BarAction>
  );
}

export function CardView(props: CardViewProps): ReactNode {
  const title = props.bay?.title ?? "";
  const step = cardStep(props.state);
  return (
    <View
      name="card"
      hidden={props.hidden}
      aria-labelledby="view-card-title"
      tabIndex={-1}
    >
      <Bar where={props.bay?.product ?? ""}>
        <Step {...props} />
      </Bar>
      <Body>
        <Content {...props} title={title} />
        <Say>{props.said}</Say>
        <span className="max-desk:hidden">
          <Back
            label="Back to the bays"
            data-card-close
            onClick={props.on.back}
          />
        </span>
      </Body>
      <Foot
        hint={
          <>
            <Kbd>CLR</Kbd> back
            {step !== null && (
              <>
                {" "}
                · <Kbd go>GO</Kbd> {step.word}
              </>
            )}
          </>
        }
      />
    </View>
  );
}
