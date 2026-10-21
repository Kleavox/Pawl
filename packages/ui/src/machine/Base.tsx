import type { ReactNode } from "react";

import { SERIAL } from "./parts";

const BASE =
  "machine__base grid grid-cols-[minmax(0,1fr)_--spacing(240)] grid-rows-[minmax(0,1fr)] gap-10 pb-10 max-desk:contents";

const TRAY =
  "tray relative grid place-items-center overflow-hidden border-[length:--spacing(2)] border-solid border-pw-trim rounded-[--spacing(10)] bg-[linear-gradient(180deg,var(--pw-black),var(--pw-graphite-lo))] shadow-[inset_0_--spacing(12)_--spacing(26)_rgb(0_0_0/85%),0_--spacing(1)_0_var(--pw-highlight)] max-desk:row-[3] max-desk:col-[1] max-desk:self-end max-desk:justify-self-start max-desk:w-144 max-desk:h-109 max-desk:mb-9 max-desk:ml-9 max-desk:rounded-[--spacing(8)]";

const FLAP =
  "tray__flap absolute top-8 right-8 bottom-auto left-8 z-2 grid place-items-center h-[58%] border-[length:--spacing(1)] border-solid border-pw-trim rounded-[--spacing(6)_--spacing(6)_--spacing(3)_--spacing(3)] bg-(image:--pw-brushed) shadow-[inset_0_--spacing(1)_0_var(--pw-highlight),0_--spacing(6)_--spacing(12)_rgb(0_0_0/55%)] origin-top [transition:transform_360ms_var(--pw-ease-mech)] [.tray:has([data-tray]:not([data-tray=none]))_&]:[transform:perspective(--spacing(420))_rotateX(-62deg)] group-data-[status=dispensing]/machine:animate-[flap-thunk_var(--pw-t6)_var(--pw-ease-mech)_1_both] group-data-[swallow]/machine:animate-[flap-swallow_200ms_var(--pw-ease-mech)_1_both]";

const PUSH =
  "tray__push text-pw-etch-dim font-pw-mono text-14 font-bold tracking-[0.4em]";

const TRAY_LABEL =
  "tray__label absolute right-14 bottom-8 text-pw-ink-dim font-pw-mono text-14 font-bold tracking-[0.2em] [.tray:has([data-tray]:not([data-tray=none]))_&]:hidden max-desk:right-8 max-desk:tracking-[0.12em]";

const STICKER =
  "tray__sticker absolute bottom-6 left-14 z-1 inline-flex items-center gap-10 py-1 pr-8 pl-10 border-[length:--spacing(2)] border-solid border-pw-black rounded-[--spacing(2)] bg-pw-warn text-pw-black font-pw-mono text-14 font-extrabold leading-none tracking-[0.06em] whitespace-nowrap [.tray:has([data-tray]:not([data-tray=none]))_&]:hidden max-desk:hidden";

const TIPPING =
  "relative w-7 h-11 border-[length:--spacing(2)] border-solid border-pw-black rounded-[--spacing(1)] [transform:rotate(-20deg)] after:absolute after:-bottom-4 after:-left-4 after:w-14 after:h-2 after:bg-pw-black after:[transform:rotate(20deg)]";

const PLATE =
  "plate relative grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto_auto] content-center gap-x-8 gap-y-5 px-14 py-8 border-[length:--spacing(1)] border-solid border-pw-trim rounded-[--spacing(5)] bg-[repeating-linear-gradient(90deg,rgb(255_255_255/6%)_0_--spacing(1),transparent_--spacing(1)_--spacing(3)),linear-gradient(180deg,var(--pw-label),var(--pw-label-lo))] shadow-[inset_0_--spacing(1)_0_var(--pw-highlight)] text-pw-etch font-pw-mono max-desk:row-[4] max-desk:grid-cols-[auto_auto_minmax(0,1fr)] max-desk:grid-rows-[auto] max-desk:gap-12 max-desk:px-12 max-desk:py-0";

const RIVETS =
  "plate__rivets absolute inset-0 pointer-events-none max-desk:hidden";

const RIVET =
  "absolute top-5 size-6 rounded-full bg-[radial-gradient(circle_at_35%_35%,var(--pw-steel-hi),var(--pw-steel-lo)_70%)]";

const SERIAL_CLASS =
  "plate__serial col-span-full self-center font-pw-display text-16 font-bold tracking-[0.16em] whitespace-nowrap max-desk:col-[1] max-desk:row-[1] max-desk:text-14 max-desk:tracking-[0.08em]";

const LINKS =
  "plate__links col-[1] row-[2] self-center flex flex-wrap gap-x-8 gap-y-2 whitespace-nowrap text-14 font-bold tracking-[0.06em] max-desk:col-[2] max-desk:row-[1] max-desk:gap-6";

const LINK = "text-inherit underline-offset-[--spacing(3)]";

const COPY =
  "plate__copy col-span-full text-14 font-bold tracking-[0.04em] max-desk:hidden";

const FEET =
  "machine__feet absolute right-60 -bottom-12 left-60 flex justify-between pointer-events-none max-desk:right-30 max-desk:left-30";

const FOOT =
  "relative w-56 h-12 before:absolute before:top-0 before:left-1/2 before:w-14 before:h-7 before:bg-[repeating-linear-gradient(180deg,var(--pw-steel-mid)_0_--spacing(1),var(--pw-graphite)_--spacing(1)_--spacing(2))] before:[transform:translateX(-50%)] after:absolute after:inset-x-0 after:bottom-0 after:h-5 after:rounded-[--spacing(2)_--spacing(2)_--spacing(4)_--spacing(4)] after:bg-[linear-gradient(180deg,var(--pw-steel-lo),var(--pw-graphite))] max-desk:w-40 max-desk:before:w-10";

const SOUND =
  "sound-switch group/sound inline-flex items-center gap-6 pt-2 pr-5 pb-2 pl-8 leading-none border-[length:--spacing(1)] border-solid border-pw-trim rounded-[--spacing(12)] bg-pw-steel-hi text-pw-etch font-pw-mono text-14 font-bold tracking-[0.12em] uppercase cursor-pointer before:content-['♪'] before:text-15 before:leading-none col-[2] row-[2] max-desk:col-[3] max-desk:row-[1] max-desk:justify-self-end";

const TRACK =
  "sound-switch__track relative w-26 h-14 rounded-[--spacing(7)] bg-pw-etch group-aria-pressed/sound:bg-pw-cobalt";

const KNOB =
  "absolute top-2 left-2 size-10 rounded-full bg-pw-white [transition:transform_var(--pw-t-key)_var(--pw-ease-mech)] group-aria-pressed/sound:[transform:translateX(--spacing(12))]";

const SOUND_LABEL =
  "sound-switch__label absolute w-px h-px overflow-hidden [clip-path:inset(50%)] whitespace-nowrap";

export function SoundSwitch(props: {
  pressed: boolean;
  onToggle: () => void;
}): ReactNode {
  return (
    <button
      className={SOUND}
      type="button"
      data-sound
      aria-pressed={props.pressed}
      onClick={props.onToggle}
    >
      <span className={TRACK} aria-hidden="true">
        <i className={KNOB} />
      </span>
      <span className={SOUND_LABEL}>Sound</span>
    </button>
  );
}

export function Base(props: {
  siteName: string;
  rootOrigin: string;
  inert: boolean;
  sound?: ReactNode;
  tray?: ReactNode;
}): ReactNode {
  return (
    <div className={BASE}>
      <div className={TRAY} data-part="tray">
        <span className={FLAP} aria-hidden="true">
          <span className={PUSH}>PUSH</span>
        </span>
        <span className={TRAY_LABEL} aria-hidden="true">
          DELIVERY BAY
        </span>
        <span className={STICKER} data-sticker="tilt" aria-hidden="true">
          <i className={TIPPING} />
          NEVER ROCK OR TILT
        </span>
        {props.tray}
      </div>
      <div className={PLATE} data-part="plate" inert={props.inert}>
        <span className={RIVETS} aria-hidden="true">
          <i className={`${RIVET} left-6`} />
          <i className={`${RIVET} right-6`} />
        </span>
        <span className={SERIAL_CLASS}>{SERIAL}</span>
        {props.sound}
        <span className={LINKS}>
          <a className={LINK} href={`${props.rootOrigin}/privacy.html`}>
            Privacy
          </a>
          <span aria-hidden="true">·</span>
          <a className={LINK} href={`${props.rootOrigin}/terms.html`}>
            Terms
          </a>
        </span>
        <span className={COPY} suppressHydrationWarning>
          © {new Date().getFullYear()} {props.siteName}
        </span>
      </div>
    </div>
  );
}

export function Feet(): ReactNode {
  return (
    <span className={FEET} aria-hidden="true">
      <i className={FOOT} />
      <i className={FOOT} />
    </span>
  );
}
