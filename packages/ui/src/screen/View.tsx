import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
  ReactNode,
  Ref,
} from "react";

const SCREEN =
  "screen absolute inset-0 overflow-hidden text-pw-ink font-pw-ui [--bar:--spacing(38)] [--foot:--spacing(34)] [--pad:--spacing(18)] max-desk:[--bar:--spacing(34)] max-desk:[--foot:--spacing(30)] max-desk:[--pad:--spacing(10)] [&.is-wiping]:after:absolute [&.is-wiping]:after:z-2 [&.is-wiping]:after:inset-0 [&.is-wiping]:after:bg-[linear-gradient(to_top,var(--pw-ice)_0_--spacing(2),rgb(47_107_255/45%)_--spacing(2),transparent_--spacing(18))] [&.is-wiping]:after:pointer-events-none [&.is-wiping]:after:animate-[wipe-line_220ms_linear_1_both] [&.is-scanning-off]:before:absolute [&.is-scanning-off]:before:inset-0 [&.is-scanning-off]:before:z-3 [&.is-scanning-off]:before:bg-(image:--pw-lcd) [&.is-scanning-off]:before:animate-[pass-scan-off_150ms_linear_1_both]";

const VIEW =
  "view absolute inset-0 grid grid-rows-[var(--bar)_minmax(0,1fr)_var(--foot)] [background:inherit] [&[hidden]]:hidden [&&:focus]:[outline:none] focus-visible:shadow-[inset_0_0_0_--spacing(2)_var(--pw-cobalt-hi)]";

const BAR =
  "view__bar flex items-center justify-between gap-12 min-w-0 pr-10 pl-16 py-0 [border-bottom:--spacing(1)_solid_var(--pw-screen-line)] bg-[linear-gradient(180deg,rgb(47_107_255/10%),transparent)] text-pw-ice font-pw-mono text-14 font-bold tracking-[0.14em] uppercase whitespace-nowrap max-desk:pr-8 max-desk:pl-10 max-desk:tracking-[0.1em]";

const WHERE = "view__where min-w-0 overflow-hidden text-ellipsis";

const STEP = "view__step flex-none text-pw-ink-dim";

const BAR_ACTION =
  "view__bar-action flex-none inline-flex items-center h-30 px-12 border-[length:--spacing(1)] border-solid border-pw-cobalt rounded-[--spacing(4)] bg-pw-cobalt-wash text-pw-ice [font:inherit] [letter-spacing:inherit] cursor-pointer [transition:background_var(--pw-t-key)_var(--pw-ease-mech),box-shadow_var(--pw-t-key)_var(--pw-ease-mech)] [&[hidden]]:hidden hover:bg-pw-cobalt hover:shadow-[0_0_--spacing(12)_var(--pw-cobalt-glow)] hover:text-pw-white focus-visible:bg-pw-cobalt focus-visible:shadow-[0_0_--spacing(12)_var(--pw-cobalt-glow)] focus-visible:text-pw-white [&&:focus-visible]:[outline:none] [&&:hover]:[outline:none] [&.is-leaving]:bg-pw-cobalt [&.is-leaving]:shadow-[0_0_--spacing(12)_var(--pw-cobalt-glow)] [&.is-leaving]:text-pw-white max-desk:px-8";

const BODY: Record<"plain" | "center" | "tiles", string> = {
  plain:
    "view__body grid content-center justify-items-start gap-12 min-h-0 py-(--pad) px-36 overflow-hidden max-desk:gap-7 max-desk:px-14 [&:has(>[data-say]:not(:empty))_[data-aside]]:hidden",
  center:
    "view__body view__body--center grid content-center justify-items-center gap-12 min-h-0 py-(--pad) px-36 overflow-hidden text-center max-desk:gap-7 max-desk:px-14 [&:has(>[data-say]:not(:empty))_[data-aside]]:hidden",
  tiles:
    "view__body view__body--tiles relative grid content-stretch justify-items-stretch gap-12 min-h-0 p-12 overflow-hidden max-desk:gap-7 max-desk:p-8 [&:has(>[data-say]:not(:empty))_[data-aside]]:hidden",
};

const FOOT =
  "view__foot relative grid items-center min-w-0 px-16 [border-top:--spacing(1)_solid_var(--pw-screen-line)] text-pw-ink-dim font-pw-mono text-14 font-semibold tracking-[0.06em] whitespace-nowrap max-desk:px-8 max-desk:tracking-[0.02em] [&:has([data-say]:not(:empty))_[data-hint]]:hidden";

const HINT = "view__hint min-w-0 m-0 overflow-hidden text-center text-ellipsis";

const KBD =
  "inline-grid place-items-center align-middle min-w-20 h-18 px-4 rounded-[--spacing(3)] bg-pw-key shadow-[0_--spacing(1)_0_var(--pw-steel-lo)] text-pw-etch [font:700_--spacing(14)/1_var(--pw-mono)]";

const KBD_GO =
  "is-go inline-grid place-items-center align-middle min-w-20 h-18 px-4 rounded-[--spacing(3)] bg-pw-cobalt shadow-[0_--spacing(1)_0_var(--pw-cobalt-lo)] text-pw-white [font:700_--spacing(14)/1_var(--pw-mono)]";

const SAY =
  "view__say m-0 overflow-hidden text-pw-danger font-pw-ui text-14 font-semibold tracking-[0] text-center text-ellipsis whitespace-normal empty:hidden [[data-body]>&]:text-left [[data-body=tiles]>&]:absolute [[data-body=tiles]>&]:right-12 [[data-body=tiles]>&]:bottom-12 [[data-body=tiles]>&]:left-12 [[data-body=tiles]>&]:z-1 [[data-body=tiles]>&]:px-14 [[data-body=tiles]>&]:py-10 [[data-body=tiles]>&]:rounded-[--spacing(6)] [[data-body=tiles]>&]:bg-pw-screen [[data-body=tiles]>&]:shadow-[inset_0_0_0_--spacing(1)_var(--pw-danger),0_--spacing(6)_--spacing(16)_var(--pw-shade)]";

const TITLE =
  "view__title m-0 text-pw-white font-pw-display text-26 font-bold leading-[1.15] tracking-[0.01em] max-desk:text-20";

const EYEBROW: Record<"plain" | "ok", string> = {
  plain:
    "view__eyebrow m-0 text-pw-ice font-pw-mono text-14 font-bold tracking-[0.18em] uppercase",
  ok: "view__eyebrow is-ok m-0 text-pw-ok font-pw-mono text-14 font-bold tracking-[0.18em] uppercase",
};

const NOTE_BASE =
  "view__note m-0 text-14 leading-[1.35] empty:hidden [&_a]:text-pw-ice [&_strong]:text-pw-ink [&_a.is-leaving]:text-pw-white [&_a.is-leaving]:[text-shadow:0_0_--spacing(8)_var(--pw-cobalt-hi)]";

const NOTE: Record<"plain" | "line" | "tries" | "email", string> = {
  plain: `${NOTE_BASE} text-pw-ink-dim`,
  line: `${NOTE_BASE} view__note--line text-pw-ink-dim max-w-full overflow-hidden text-ellipsis whitespace-nowrap`,
  tries: `${NOTE_BASE} view__tries text-pw-warn`,
  email: `${NOTE_BASE} view__email text-pw-ink font-pw-mono max-w-full overflow-hidden text-ellipsis whitespace-nowrap`,
};

const BACK =
  "view__back min-h-30 p-0 border-0 [background:none] text-pw-ice font-pw-ui text-15 font-semibold underline underline-offset-[--spacing(3)] cursor-pointer";

const CHOICES =
  "choices grid gap-10 w-[min(100%,--spacing(460))] m-0 p-0 list-none max-desk:gap-5";

const CHOICE =
  "choice grid grid-cols-[--spacing(28)_--spacing(30)_minmax(0,1fr)] gap-12 items-center w-full h-56 max-desk:[[data-dense]_&]:h-44 px-16 border-[length:--spacing(1)] border-solid border-pw-screen-edge rounded-[--spacing(8)] bg-pw-screen-hi text-pw-ink font-pw-ui text-17 font-semibold text-left cursor-pointer [transition:border-color_var(--pw-t-key)_var(--pw-ease-mech),background_var(--pw-t-key)_var(--pw-ease-mech)] hover:border-pw-cobalt-hi hover:bg-[rgb(47_107_255/18%)] max-desk:grid-cols-[--spacing(26)_--spacing(24)_minmax(0,1fr)] max-desk:gap-8 max-desk:px-10 max-desk:text-16";

const CHOICE_KEY =
  "choice__key grid place-items-center h-26 rounded-[--spacing(4)] bg-pw-key shadow-[0_--spacing(2)_0_var(--pw-steel-lo)] text-pw-etch [font:700_--spacing(15)/1_var(--pw-mono)]";

const CHOICE_MARK =
  "choice__mark text-pw-ice [font:800_--spacing(14)/1_var(--pw-mono)] text-center";

const CHOICE_LABEL =
  "choice__label overflow-hidden text-ellipsis whitespace-nowrap";

const FORM = "view__email grid gap-8 w-[min(100%,--spacing(520))]";

const LABEL =
  "view__label text-pw-ice font-pw-mono text-14 font-bold tracking-[0.14em] uppercase";

const FIELD =
  "view__field grid grid-cols-[minmax(0,1fr)_auto] gap-10 max-desk:grid-cols-[minmax(0,1fr)] max-desk:gap-7";

const INPUT =
  "view__input w-full min-w-0 h-56 px-14 border-[length:--spacing(1)] border-solid border-pw-screen-edge rounded-[--spacing(8)] bg-pw-screen-field text-pw-ink font-pw-ui [font-size:max(16px,--spacing(17))] placeholder:text-pw-ink-dim";

const ACTIONS = "view__actions flex flex-wrap gap-10";

const BUTTON_BASE =
  "view__button inline-grid place-items-center min-w-150 h-56 px-18 border-[length:--spacing(1)] border-solid rounded-[--spacing(8)] font-pw-ui text-16 font-bold no-underline whitespace-nowrap cursor-pointer max-desk:min-w-0 max-desk:flex-1 [&.is-leaving]:border-pw-cobalt-hi [&.is-leaving]:bg-pw-cobalt [&.is-leaving]:shadow-[0_0_--spacing(18)_var(--pw-cobalt)] [&.is-leaving]:text-pw-white";

const BUTTON: Record<"plain" | "go" | "danger", string> = {
  plain: `${BUTTON_BASE} border-pw-screen-edge bg-pw-screen-hi text-pw-ink hover:border-pw-cobalt-hi`,
  go: `${BUTTON_BASE} view__button--go border-pw-cobalt bg-pw-cobalt shadow-[0_0_--spacing(14)_var(--pw-cobalt-glow)] text-pw-white hover:bg-pw-cobalt-hi`,
  danger: `${BUTTON_BASE} view__button--danger border-pw-danger bg-transparent text-pw-danger`,
};

const CELLS =
  "code-cells grid grid-cols-[repeat(6,--spacing(48))] gap-8 max-desk:grid-cols-[repeat(6,--spacing(42))] max-desk:gap-6";

const CELL_BASE =
  "code-cell grid place-items-center h-58 border-[length:--spacing(1)] border-solid rounded-[--spacing(7)] bg-pw-screen-field text-pw-white [font:800_--spacing(26)/1_var(--pw-mono)] max-desk:h-52";

const CELL: Record<"empty" | "next" | "filled", string> = {
  empty: `${CELL_BASE} border-pw-screen-edge`,
  next: `${CELL_BASE} border-pw-ice`,
  filled: `${CELL_BASE} border-pw-cobalt-hi shadow-[0_0_0_--spacing(3)_rgb(47_107_255/18%)]`,
};

const DOT =
  "size-10 rounded-full bg-pw-cobalt-hi shadow-[0_0_--spacing(8)_var(--pw-cobalt)] animate-[loader-dot_8100ms_ease-in-out_1_both]";

export function Screen(props: {
  children: ReactNode;
  screenRef?: Ref<HTMLDivElement>;
  id?: string;
}): ReactNode {
  return (
    <div
      ref={props.screenRef}
      id={props.id}
      className={SCREEN}
      data-screen-views
    >
      {props.children}
    </div>
  );
}

export function View({
  name,
  hidden,
  className,
  children,
  ...rest
}: {
  name: string;
  hidden: boolean;
  className?: string;
  children: ReactNode;
} & Omit<
  ComponentPropsWithoutRef<"section">,
  "hidden" | "className"
>): ReactNode {
  return (
    <section
      {...rest}
      className={`${VIEW} ${className ?? ""}`}
      data-view-panel={name}
      hidden={hidden}
    >
      {children}
    </section>
  );
}

export function Bar(props: {
  where: ReactNode;
  children?: ReactNode;
}): ReactNode {
  return (
    <div className={BAR}>
      <span className={WHERE}>{props.where}</span>
      {props.children}
    </div>
  );
}

export function Step(
  props: { children?: ReactNode } & Omit<
    ComponentPropsWithoutRef<"span">,
    "className"
  >,
): ReactNode {
  return <span {...props} className={STEP} />;
}

export function BarAction(
  props: { leaving?: boolean } & Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "className"
  >,
): ReactNode {
  const { leaving, ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      className={`${BAR_ACTION} ${leaving ? "is-leaving" : ""}`}
    />
  );
}

export function BarLink(
  props: { leaving?: boolean } & Omit<
    ComponentPropsWithoutRef<"a">,
    "className"
  >,
): ReactNode {
  const { leaving, ...rest } = props;
  return (
    <a
      {...rest}
      className={`${BAR_ACTION} no-underline ${leaving ? "is-leaving" : ""}`}
    />
  );
}

export function Body(props: {
  variant?: "plain" | "center" | "tiles";
  children: ReactNode;
}): ReactNode {
  const variant = props.variant ?? "plain";
  return (
    <div className={BODY[variant]} data-body={variant}>
      {props.children}
    </div>
  );
}

export function Foot(props: {
  hint: ReactNode;
  children?: ReactNode;
}): ReactNode {
  return (
    <div className={FOOT}>
      <p className={HINT} aria-hidden="true" data-hint>
        {props.hint}
      </p>
      {props.children}
    </div>
  );
}

export function Kbd(props: { go?: boolean; children: ReactNode }): ReactNode {
  return <kbd className={props.go ? KBD_GO : KBD}>{props.children}</kbd>;
}

export function Say(
  props: { children?: ReactNode } & Omit<
    ComponentPropsWithoutRef<"p">,
    "className" | "role"
  >,
): ReactNode {
  const { children, ...rest } = props;
  return (
    <p {...rest} className={SAY} role="alert" data-say>
      {children}
    </p>
  );
}

export function Title(
  props: { children: ReactNode; as?: "h2" | "p" } & Omit<
    ComponentPropsWithoutRef<"h2">,
    "className"
  >,
): ReactNode {
  const { as, ...rest } = props;
  const Tag = as ?? "h2";
  return <Tag {...rest} className={TITLE} />;
}

export function Eyebrow(props: {
  ok?: boolean;
  children: ReactNode;
}): ReactNode {
  return <p className={EYEBROW[props.ok ? "ok" : "plain"]}>{props.children}</p>;
}

export function Note(
  props: {
    tone?: "plain" | "line" | "tries" | "email";
    aside?: boolean;
    children?: ReactNode;
  } & Omit<ComponentPropsWithoutRef<"p">, "className">,
): ReactNode {
  const { tone, aside, children, ...rest } = props;
  return (
    <p
      {...rest}
      className={`${NOTE[tone ?? "plain"]} ${aside ? "view__aside" : ""}`}
      data-aside={aside ? "" : undefined}
    >
      {children}
    </p>
  );
}

export function Back(
  props: { label: string } & Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "className" | "type"
  >,
): ReactNode {
  const { label, ...rest } = props;
  return (
    <button {...rest} className={BACK} type="button" data-step-back>
      ‹ {label}
    </button>
  );
}

export function Choices(props: {
  children: ReactNode;
  dense?: boolean;
}): ReactNode {
  return (
    <ol className={CHOICES} data-dense={props.dense ? "" : undefined}>
      {props.children}
    </ol>
  );
}

export function Choice(
  props: {
    keyLabel: string;
    mark: string;
    label: string;
  } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "type">,
): ReactNode {
  const { keyLabel, mark, label, ...rest } = props;
  return (
    <li>
      <button
        {...rest}
        className={CHOICE}
        type="button"
        aria-keyshortcuts={keyLabel}
      >
        <kbd className={CHOICE_KEY} aria-hidden="true">
          {keyLabel}
        </kbd>
        <span className={CHOICE_MARK} aria-hidden="true">
          {mark}
        </span>
        <span className={CHOICE_LABEL}>{label}</span>
      </button>
    </li>
  );
}

export function Form(
  props: { children: ReactNode } & Omit<
    ComponentPropsWithoutRef<"form">,
    "className"
  >,
): ReactNode {
  return <form {...props} className={FORM} noValidate />;
}

export function Field(
  props: {
    label: string;
    id: string;
    action?: ReactNode;
  } & Omit<ComponentPropsWithoutRef<"input">, "className" | "id">,
): ReactNode {
  const { label, id, action, ...input } = props;
  return (
    <>
      <label className={LABEL} htmlFor={id}>
        {label}
      </label>
      <span className={FIELD}>
        <input {...input} className={INPUT} id={id} />
        {action}
      </span>
    </>
  );
}

export function Actions(props: { children: ReactNode }): ReactNode {
  return <div className={ACTIONS}>{props.children}</div>;
}

export function ViewButton(
  props: { tone?: "plain" | "go" | "danger"; leaving?: boolean } & Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "className"
  >,
): ReactNode {
  const { tone, leaving, type, ...rest } = props;
  return (
    <button
      type={type ?? "button"}
      {...rest}
      className={`${BUTTON[tone ?? "plain"]} ${leaving ? "is-leaving" : ""}`}
    />
  );
}

export function ViewLink(
  props: { tone?: "plain" | "go" | "danger"; leaving?: boolean } & Omit<
    ComponentPropsWithoutRef<"a">,
    "className"
  >,
): ReactNode {
  const { tone, leaving, ...rest } = props;
  return (
    <a
      {...rest}
      className={`${BUTTON[tone ?? "plain"]} ${leaving ? "is-leaving" : ""}`}
    />
  );
}

export function CodeCells(props: {
  digits: string;
  length?: number;
}): ReactNode {
  const length = props.length ?? 6;
  return (
    <div className={CELLS} aria-hidden="true">
      {Array.from({ length }, (_, index) => {
        const digit = props.digits[index] ?? "";
        const state =
          digit !== ""
            ? "filled"
            : index === props.digits.length
              ? "next"
              : "empty";
        return (
          <span
            key={index}
            className={CELL[state]}
            data-code-cell
            data-filled={String(digit !== "")}
          >
            {digit}
          </span>
        );
      })}
    </div>
  );
}

export function Loader(): ReactNode {
  return (
    <span className="view__loader flex gap-8" aria-hidden="true">
      <i className={DOT} />
      <i className={`${DOT} [animation-delay:150ms]`} />
      <i className={`${DOT} [animation-delay:300ms]`} />
    </span>
  );
}
