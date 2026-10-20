import type { ReactNode } from "react";

import { BRAILLE, DIGIT_ROWS, TACTILE } from "./parts";

export type MachineKey =
  | { kind: "link"; href: string }
  | { kind: "submit"; form: string; name?: string; value?: string }
  | { kind: "button"; onPress?: () => void };

export type KeypadProps = {
  mode: "machine" | "service";
  lit: ReadonlySet<string>;
  onPress?: (key: string) => void;
  onTouch?: (key: string) => void;
  clr?: MachineKey;
  go?: MachineKey;
  caption?: string;
};

const KEYPAD =
  "keypad row-[4] grid grid-cols-3 grid-rows-[--spacing(16)_repeat(4,minmax(0,1fr))] gap-6 p-10 rounded-[--spacing(10)] bg-[linear-gradient(180deg,var(--pw-steel-mid),var(--pw-steel-lo))] shadow-[inset_0_--spacing(2)_--spacing(5)_rgb(0_0_0/30%),0_--spacing(1)_0_rgb(255_255_255/40%)] max-desk:col-[2] max-desk:row-[2/5] max-desk:grid-rows-[--spacing(13)_repeat(4,minmax(0,1fr))] max-desk:gap-3 max-desk:p-5";

const MODE_ROW =
  "keypad__mode col-span-full flex items-center justify-center gap-22 max-desk:gap-14";

const CAPTION =
  "keypad__mode keypad__caption col-span-full flex items-center justify-center gap-22 min-w-0 m-0 overflow-hidden text-pw-etch font-pw-mono text-14 font-bold leading-[--spacing(16)] tracking-[0.02em] text-center text-ellipsis whitespace-nowrap max-desk:gap-14";

const LAMP =
  "mode-lamp relative inline-flex items-center gap-6 text-pw-etch font-pw-mono text-14 font-bold tracking-[0.14em] uppercase";

const LAMP_ARROW =
  "before:content-['▸'] before:absolute before:-left-13 before:text-pw-cobalt-lo";

const BULB_OFF =
  "size-7 rounded-full bg-pw-off shadow-[inset_0_--spacing(1)_--spacing(1)_rgb(0_0_0/50%),0_--spacing(1)_0_var(--pw-highlight)] group-data-[lamp-test]/machine:bg-pw-cobalt-hi group-data-[lamp-test]/machine:shadow-[0_0_--spacing(6)_var(--pw-cobalt)]";

const BULB_ON =
  "size-7 rounded-full bg-pw-cobalt-hi shadow-[0_0_--spacing(6)_var(--pw-cobalt),0_--spacing(1)_0_var(--pw-highlight)]";

const FACE =
  "pw-key key keycap border-pw-steel-lo bg-[linear-gradient(180deg,var(--pw-white),var(--pw-key)_60%)] text-pw-etch";

const FACE_GO =
  "pw-key pw-key--go key key--go keycap border-pw-cobalt-lo bg-[linear-gradient(180deg,var(--pw-cobalt-hi),var(--pw-cobalt))] text-pw-white";

const RAISED =
  "shadow-[0_--spacing(3)_0_var(--pw-steel-lo),0_--spacing(4)_--spacing(8)_rgb(0_0_0/30%),inset_0_--spacing(1)_0_var(--pw-white)]";

const RAISED_GO =
  "shadow-[0_--spacing(3)_0_var(--pw-cobalt-lo),0_0_--spacing(16)_var(--pw-cobalt-glow),inset_0_--spacing(1)_0_rgb(255_255_255/35%)]";

const PRESS =
  "active:[transform:translateY(--spacing(2))] active:shadow-[0_--spacing(1)_0_var(--pw-steel-lo),0_--spacing(1)_--spacing(3)_rgb(0_0_0/30%),inset_0_--spacing(1)_0_var(--pw-white)] [&.is-pressed]:[transform:translateY(--spacing(2))] [&.is-pressed]:shadow-[0_--spacing(1)_0_var(--pw-steel-lo),0_--spacing(1)_--spacing(3)_rgb(0_0_0/30%),inset_0_--spacing(1)_0_var(--pw-white)]";

const PLATE = "is-plate";

const BRAILLE_CELL =
  "pw-braille absolute right-9 bottom-8 w-8 h-13 pointer-events-none before:absolute before:-top-10 before:-left-10 before:size-3 before:rounded-full";

const TACTILE_MARK = {
  bar: "absolute bottom-8 left-1/2 w-12 h-2 rounded-[--spacing(1)] bg-pw-steel-lo shadow-[0_--spacing(1)_0_var(--pw-white)] [transform:translateX(-50%)] pointer-events-none",
  circle:
    "absolute right-8 bottom-7 size-9 rounded-full border-[length:--spacing(1.5)] border-solid border-[rgb(255_255_255/60%)] shadow-[0_--spacing(1)_0_rgb(0_0_0/25%)] pointer-events-none",
  arrow:
    "absolute right-7 bottom-7 w-11 h-7 fill-none stroke-pw-steel-lo [stroke-width:1.6] [stroke-linecap:round] [stroke-linejoin:round] pointer-events-none",
} as const;

function Tactile({ label }: { label: string }): ReactNode {
  const kind = TACTILE[label];
  if (kind === undefined) return null;
  if (kind === "arrow") {
    return (
      <svg
        className={TACTILE_MARK.arrow}
        data-tactile="arrow"
        aria-hidden="true"
        viewBox="0 0 11 7"
      >
        <path d="M10 3.5H1.5M4 1L1.5 3.5L4 6" />
      </svg>
    );
  }
  return (
    <span
      className={TACTILE_MARK[kind]}
      data-tactile={kind}
      aria-hidden="true"
    />
  );
}

function tone(label: string): { face: string; raised: string; size: string } {
  if (label === "GO")
    return { face: FACE_GO, raised: RAISED_GO, size: "text-19" };
  if (label === "CLR")
    return { face: `${FACE} key--fn`, raised: RAISED, size: "text-15" };
  return { face: FACE, raised: RAISED, size: "text-19" };
}

function Braille({ digit }: { digit: string }): ReactNode {
  const cell = BRAILLE[digit];
  if (cell === undefined) return null;
  return (
    <span
      className={`${BRAILLE_CELL} ${cell.dots}`}
      data-braille={cell.cells}
      aria-hidden="true"
    />
  );
}

function Plate({ label }: { label: string }): ReactNode {
  const { face, raised, size } = tone(label);
  return (
    <span
      className={`${face} ${raised} ${size} ${PRESS} ${PLATE}`}
      aria-hidden="true"
    >
      {label}
      <Braille digit={label} />
      <Tactile label={label} />
    </span>
  );
}

function ServiceKey({
  label,
  machineKey,
  lit,
  described,
  onPress,
}: {
  label: "CLR" | "GO";
  machineKey: MachineKey | undefined;
  lit: boolean;
  described: boolean;
  onPress?: (key: string) => void;
}): ReactNode {
  if (machineKey === undefined) return <Plate label={label} />;
  const { face, raised, size } = tone(label);
  const className = `${face} ${raised} ${size} ${PRESS} cursor-pointer`;
  const about = described ? "keys-caption" : undefined;
  if (machineKey.kind === "link") {
    return (
      <a className={className} href={machineKey.href} aria-describedby={about}>
        {label}
        <Tactile label={label} />
      </a>
    );
  }
  if (machineKey.kind === "submit") {
    return (
      <button
        className={className}
        type="submit"
        form={machineKey.form}
        name={machineKey.name}
        value={machineKey.value}
        aria-describedby={about}
        aria-disabled={lit ? "false" : "true"}
        onClick={(event) => {
          if (!lit) event.preventDefault();
        }}
      >
        {label}
        <Tactile label={label} />
      </button>
    );
  }
  return (
    <button
      className={className}
      type="button"
      data-key={label}
      aria-describedby={about}
      aria-disabled={lit ? "false" : "true"}
      onClick={() => {
        if (lit) (machineKey.onPress ?? (() => onPress?.(label)))();
      }}
    >
      {label}
      <Tactile label={label} />
    </button>
  );
}

function DigitKey({
  label,
  lit,
  always,
  onPress,
  onTouch,
}: {
  label: string;
  lit: boolean;
  always: boolean;
  onPress?: (key: string) => void;
  onTouch?: (key: string) => void;
}): ReactNode {
  if (!always && !lit) return <Plate label={label} />;
  const { face, raised, size } = tone(label);
  return (
    <button
      className={`${face} ${raised} ${size} ${PRESS} cursor-pointer`}
      type="button"
      data-key={label}
      aria-disabled={lit ? "false" : "true"}
      onClick={() => {
        onTouch?.(label);
        if (lit) onPress?.(label);
      }}
    >
      {label}
      <Braille digit={label} />
      <Tactile label={label} />
    </button>
  );
}

export function Keypad(props: KeypadProps): ReactNode {
  const { mode, lit, onPress } = props;
  if (mode === "machine") {
    const lamp = (
      which: "selector" | "otp",
      word: string,
      on: boolean,
    ): ReactNode => (
      <span
        className={`${LAMP} ${on ? LAMP_ARROW : ""}`}
        data-keypad-mode={which}
      >
        <i className={on ? BULB_ON : BULB_OFF} />
        {word}
      </span>
    );
    return (
      <div
        className={KEYPAD}
        data-part="keypad"
        role="group"
        aria-label="Bay selector keypad"
      >
        <span className={MODE_ROW} aria-hidden="true">
          {lamp("selector", "Select", true)}
          {lamp("otp", "Code", false)}
        </span>
        {[...DIGIT_ROWS, "CLR", "0", "GO"].map((label) => (
          <DigitKey
            key={label}
            label={label}
            lit={lit.has(label)}
            always
            onPress={onPress}
            onTouch={props.onTouch}
          />
        ))}
      </div>
    );
  }
  const described = props.caption !== undefined;
  return (
    <div
      className={`${KEYPAD} keypad--service`}
      data-part="keypad"
      role="group"
      aria-label="Keypad"
    >
      {described ? (
        <p className={CAPTION} id="keys-caption">
          {props.caption}
        </p>
      ) : (
        <span className={MODE_ROW} aria-hidden="true">
          <span className={`${LAMP} is-on`}>
            <i className={BULB_ON} />
            Service
          </span>
        </span>
      )}
      {DIGIT_ROWS.map((label) => (
        <DigitKey
          key={label}
          label={label}
          lit={lit.has(label)}
          always={onPress !== undefined}
          onPress={onPress}
        />
      ))}
      <ServiceKey
        label="CLR"
        machineKey={props.clr}
        lit={lit.has("CLR")}
        described={described}
        onPress={onPress}
      />
      <DigitKey
        label="0"
        lit={lit.has("0")}
        always={onPress !== undefined}
        onPress={onPress}
      />
      <ServiceKey
        label="GO"
        machineKey={props.go}
        lit={lit.has("GO")}
        described={described}
        onPress={onPress}
      />
    </div>
  );
}
