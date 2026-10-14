import type { ReactNode } from "react";

import { Keypad, type KeypadProps } from "./Keypad";

const STRIP =
  "strip grid grid-rows-[--spacing(22)_--spacing(70)_--spacing(40)_--spacing(284)_--spacing(28)_--spacing(36)] gap-8 min-h-0 p-12 border-[length:--spacing(1)] border-solid border-pw-trim rounded-[--spacing(12)] bg-(image:--pw-brushed) shadow-[inset_0_--spacing(1)_0_var(--pw-highlight),0_--spacing(2)_0_rgb(0_0_0/30%)] max-desk:grid-cols-[minmax(0,1fr)_--spacing(196)] max-desk:grid-rows-[--spacing(18)_minmax(0,1fr)_--spacing(70)_--spacing(36)] max-desk:gap-8 max-desk:p-8";

const TOP =
  "strip__top relative grid place-items-center max-desk:col-[1] max-desk:row-[1]";

const SPEAKER =
  "strip__speaker w-[52%] h-14 rounded-[--spacing(7)] bg-pw-steel-lo bg-[radial-gradient(circle,var(--pw-black)_0_--spacing(1.4),transparent_--spacing(1.9))] bg-center [background-size:--spacing(6)_--spacing(5)] shadow-[inset_0_--spacing(1)_--spacing(2)_rgb(0_0_0/45%),0_--spacing(1)_0_var(--pw-highlight)]";

const SENSOR =
  "strip__sensor absolute top-1/2 right-6 size-10 rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--pw-steel-hi)_0_--spacing(1),var(--pw-screen)_--spacing(1.5)_60%,var(--pw-black)_100%)] shadow-[0_0_0_--spacing(2)_var(--pw-steel-lo)] [transform:translateY(-50%)]";

const LCD =
  "lcd p-6 rounded-[--spacing(8)] bg-[linear-gradient(180deg,var(--pw-graphite),var(--pw-graphite-lo))] shadow-[inset_0_0_0_--spacing(1)_var(--pw-black),0_--spacing(1)_0_var(--pw-highlight)] max-desk:col-[1] max-desk:row-[2]";

const LCD_LINE =
  "lcd__line grid content-center gap-5 h-full m-0 px-10 overflow-hidden rounded-[--spacing(4)] bg-pw-screen shadow-[inset_0_0_--spacing(14)_var(--pw-cobalt-glow)] font-pw-mono uppercase";

const LCD_MAIN =
  "lcd__main text-pw-ice text-15 font-bold leading-[1.15] tracking-[0.1em] [text-shadow:0_0_--spacing(6)_var(--pw-cobalt)]";

const LCD_SUB =
  "lcd__sub text-pw-ink-dim text-14 font-semibold leading-[1.15] tracking-[0.06em]";

const PLACARD =
  "placard grid grid-cols-3 m-0 p-0 rounded-[--spacing(3)] bg-pw-paper bg-[linear-gradient(180deg,rgb(255_255_255/55%),transparent_40%)] shadow-[0_--spacing(1)_0_rgb(0_0_0/22%),0_--spacing(3)_--spacing(6)_rgb(0_0_0/14%),inset_0_0_0_--spacing(1)_var(--pw-paper-rule)] text-pw-paper-ink list-none max-desk:hidden";

const STEP = "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5 px-6";

const STEP_RULED = "[border-left:--spacing(1)_dashed_var(--pw-paper-rule)]";

const STEP_N =
  "placard__n grid place-items-center size-17 rounded-full bg-pw-paper-ink text-pw-paper font-pw-display text-14 font-bold";

const STEP_TEXT =
  "placard__text font-pw-mono text-14 font-bold leading-[1.1] tracking-[0] uppercase whitespace-nowrap";

const LENSES =
  "lenses grid grid-cols-3 items-center px-6 border-[length:--spacing(1)] border-solid border-pw-trim rounded-[--spacing(6)] bg-[linear-gradient(180deg,var(--pw-steel-mid),var(--pw-steel))] shadow-[inset_0_--spacing(1)_0_var(--pw-highlight)] max-desk:col-[1] max-desk:row-[3] max-desk:grid-cols-1 max-desk:grid-rows-3 max-desk:px-10 max-desk:py-4";

const LENS =
  "lens inline-flex items-center justify-center gap-5 text-pw-etch font-pw-mono text-14 font-bold tracking-[0.02em] uppercase max-desk:justify-start max-desk:gap-8";

const LED = "led size-11 rounded-full";

const LED_OFF =
  "bg-[radial-gradient(circle_at_35%_30%,rgb(255_255_255/35%)_0_--spacing(2),var(--pw-off)_--spacing(3))] shadow-[0_0_0_--spacing(2)_var(--pw-steel-hi),0_0_0_--spacing(3)_var(--pw-steel-lo),inset_0_--spacing(-2)_--spacing(3)_rgb(0_0_0/45%)]";

const LED_ON: Record<"ready" | "busy" | "denied", string> = {
  ready:
    "bg-[radial-gradient(circle_at_35%_30%,rgb(255_255_255/60%)_0_--spacing(2),var(--pw-ok)_--spacing(3))] shadow-[0_0_0_--spacing(2)_var(--pw-steel-hi),0_0_0_--spacing(3)_var(--pw-steel-lo),0_0_--spacing(10)_var(--pw-ok)]",
  busy: "bg-[radial-gradient(circle_at_35%_30%,rgb(255_255_255/60%)_0_--spacing(2),var(--pw-warn)_--spacing(3))] shadow-[0_0_0_--spacing(2)_var(--pw-steel-hi),0_0_0_--spacing(3)_var(--pw-steel-lo),0_0_--spacing(10)_var(--pw-warn)]",
  denied:
    "bg-[radial-gradient(circle_at_35%_30%,rgb(255_255_255/60%)_0_--spacing(2),var(--pw-danger)_--spacing(3))] shadow-[0_0_0_--spacing(2)_var(--pw-steel-hi),0_0_0_--spacing(3)_var(--pw-steel-lo),0_0_--spacing(10)_var(--pw-danger)]",
};

const PRINTER =
  "printer grid justify-items-center content-center gap-5 max-desk:col-[1] max-desk:row-[4]";

const SLOT =
  "printer__slot relative w-[calc(var(--slot-w)_*_var(--u))] h-9 rounded-[--spacing(5)] bg-pw-black shadow-[inset_0_--spacing(2)_--spacing(3)_var(--pw-black),0_--spacing(1)_0_var(--pw-highlight)] after:absolute after:right-6 after:-bottom-1 after:left-6 after:h-3 after:[background:linear-gradient(135deg,transparent_50%,var(--pw-steel-lo)_50%)_0_0/--spacing(4)_--spacing(3)_repeat-x] after:opacity-80";

const PRINTER_LED =
  "printer__led absolute -top-6 -right-12 size-5 rounded-full bg-pw-off group-data-[leaving=printer]/machine:animate-[printer-blink_120ms_steps(1,end)_1_both] group-data-[leaving=tear]/machine:animate-[printer-blink-once_60ms_steps(1,end)_1_both]";

const PRINTER_LABEL =
  "printer__label text-pw-etch font-pw-mono text-14 font-bold tracking-[0.2em] uppercase";

export type Lit = { ready: boolean; busy: boolean; denied: boolean };

export function Strip(props: {
  lcd: { main: string; sub: string };
  keypad: KeypadProps;
  lit: Lit;
}): ReactNode {
  const led = (which: "ready" | "busy" | "denied"): string =>
    `${LED} led--${which} ${props.lit[which] ? LED_ON[which] : LED_OFF}`;
  return (
    <section className={STRIP} aria-label="Service panel">
      <div className={TOP} aria-hidden="true">
        <span className={SPEAKER} data-part="speaker" />
        <span className={SENSOR} data-part="sensor" />
      </div>
      <div className={LCD} data-part="lcd">
        <p
          className={LCD_LINE}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className={LCD_MAIN} data-screen>
            {props.lcd.main}
          </span>
          <small className={LCD_SUB} data-screen-sub>
            {props.lcd.sub}
          </small>
        </p>
      </div>
      <ol className={PLACARD} data-part="placard" aria-hidden="true">
        <li className={STEP}>
          <span className={STEP_N}>1</span>
          <span className={STEP_TEXT}>
            Pick
            <br />a bay
          </span>
        </li>
        <li className={`${STEP} ${STEP_RULED}`}>
          <span className={STEP_N}>2</span>
          <span className={STEP_TEXT}>
            Sign
            <br />
            in
          </span>
        </li>
        <li className={`${STEP} ${STEP_RULED}`}>
          <span className={STEP_N}>3</span>
          <span className={STEP_TEXT}>
            Take
            <br />
            it
          </span>
        </li>
      </ol>
      <Keypad {...props.keypad} />
      <div className={LENSES} data-part="lenses" aria-hidden="true">
        <span className={LENS}>
          <span className={led("ready")} data-led-state="ready" />
          Ready
        </span>
        <span className={LENS}>
          <span className={led("busy")} data-led-state="busy" />
          Busy
        </span>
        <span className={LENS}>
          <span className={led("denied")} data-led-state="denied" />
          Denied
        </span>
      </div>
      <div className={PRINTER} data-part="printer" aria-hidden="true">
        <span className={SLOT} data-part="printer-slot">
          <i className={PRINTER_LED} />
        </span>
        <span className={PRINTER_LABEL}>Receipts</span>
      </div>
    </section>
  );
}
