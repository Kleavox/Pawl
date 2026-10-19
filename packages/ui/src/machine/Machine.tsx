import type { ReactNode, Ref } from "react";

import { Base, Feet } from "./Base";
import { CAMERA_HINT_SCRIPT } from "./camera-hint";
import type { KeypadProps } from "./Keypad";
import type { Framing } from "./parts";
import { Strip } from "./Strip";

export type MachineProps = {
  siteName: string;
  rootOrigin: string;
  framing: Framing;
  ticker: string;
  chip: { state: "guest" | "visitor" | "owner" | "service"; word: string };
  display: ReactNode;
  lcd: { main: string; sub: string };
  keypad: KeypadProps;
  headingBrand?: boolean;
  sign?: string;
  sound?: ReactNode;
  tray?: ReactNode;
  machine?: Record<`data-${string}`, string>;
  main?: boolean;
  settled?: boolean;
  plateInert?: boolean;
  fixed?: boolean;
  tickerRef?: Ref<HTMLSpanElement>;
  cameraRef?: Ref<HTMLDivElement>;
  machineRef?: Ref<HTMLDivElement>;
};

const ROOM =
  "room h-[max(100svh,calc(var(--mh)_*_var(--u)_+_2_*_var(--margin)))] overflow-clip bg-[radial-gradient(90%_60%_at_50%_0%,var(--pw-room-spot)_0%,transparent_70%),linear-gradient(180deg,var(--pw-room)_0%,var(--pw-floor)_100%)] font-pw-ui [&:has(>.camera[data-framing=printer])]:room-printer [&:has(>.camera[data-framing=screen])]:room-screen [html[data-cam-hint=printer]_&]:room-printer [html[data-cam-hint=screen]_&]:room-screen";

const CAMERA =
  "camera absolute top-0 left-0 w-[calc(var(--mw)_*_var(--u))] [transform:translate(var(--cam-x),var(--cam-y))_scale(var(--cam-s))] origin-top-left transition-[transform] data-moving:will-change-transform duration-[560ms] ease-dolly data-[moving=out]:duration-[620ms] data-[moving=out]:ease-pull data-[moving=in]:data-[framing=printer]:delay-[120ms] data-[moving=in]:data-[framing=printer]:duration-[440ms] data-[moving=in]:data-[framing=screen]:delay-[80ms] data-[moving=in]:data-[framing=screen]:duration-[480ms] data-[framing=whole]:camera-whole data-[framing=screen]:camera-screen data-[framing=printer]:camera-printer [html[data-cam-hint=screen]_&]:camera-screen [html[data-cam-hint=printer]_&]:camera-printer";

const MACHINE =
  "machine group/machine relative grid grid-rows-[--spacing(60)_--spacing(544)_--spacing(100)] gap-10 w-[calc(var(--mw)_*_var(--u))] px-10 pt-10 pb-0 border-[length:--spacing(1)] border-solid border-pw-trim rounded-[--spacing(22)_--spacing(22)_--spacing(8)_--spacing(8)] bg-(image:--pw-brushed) shadow-[0_--spacing(34)_--spacing(70)_var(--pw-shade),0_0_0_--spacing(1)_rgb(0_0_0/45%),inset_0_--spacing(1)_0_var(--pw-highlight)] text-pw-ink [&_:focus-visible]:[outline:--spacing(2)_solid_var(--pw-cobalt-hi)] [&_:focus-visible]:[outline-offset:--spacing(2)] max-desk:grid-rows-[--spacing(46)_--spacing(380)_--spacing(290)_--spacing(84)_--spacing(34)] max-desk:gap-8 max-desk:p-8 max-desk:rounded-[--spacing(16)_--spacing(16)_--spacing(6)_--spacing(6)]";

const MARQUEE =
  "marquee relative grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-16 px-16 overflow-hidden border-[length:--spacing(1)] border-solid border-pw-black rounded-[--spacing(12)] bg-[radial-gradient(70%_140%_at_22%_50%,var(--pw-cobalt-wash)_0%,transparent_70%),linear-gradient(180deg,var(--pw-graphite)_0%,var(--pw-black)_100%)] shadow-[inset_0_--spacing(2)_--spacing(10)_var(--pw-cobalt-glow),0_--spacing(1)_0_var(--pw-highlight)] max-desk:grid-cols-[minmax(0,1fr)_auto] max-desk:gap-8 max-desk:px-10";

const BOLT =
  "marquee__bolt size-8 rounded-full bg-[radial-gradient(circle_at_35%_35%,var(--pw-steel-hi),var(--pw-steel-lo)_70%)] max-desk:hidden";

const BRAND =
  "marquee__brand m-0 text-pw-white font-pw-display text-32 font-bold leading-none tracking-[0.32em] [text-shadow:0_0_--spacing(10)_var(--pw-cobalt),0_0_--spacing(26)_var(--pw-cobalt-glow)] whitespace-nowrap max-desk:text-22 max-desk:tracking-[0.24em]";

const TICKER =
  "marquee__ticker relative h-30 overflow-hidden rounded-[--spacing(4)] bg-pw-black shadow-[inset_0_0_0_--spacing(1)_var(--pw-screen-edge)] after:absolute after:inset-0 after:[background:radial-gradient(circle,transparent_55%,rgb(0_0_0/55%)_60%)_0_0/--spacing(3)_--spacing(3)] after:pointer-events-none max-desk:hidden";

const TICKER_TEXT =
  "marquee__ticker-text absolute top-1/2 left-12 text-pw-ice font-pw-mono text-15 font-bold tracking-[0.16em] [text-shadow:0_0_--spacing(6)_var(--pw-cobalt)] whitespace-nowrap [transform:translateY(-50%)] data-[scroll=once]:animate-[machine-ticker_var(--pw-ticker-time,12s)_linear_1_both]";

const CHIP =
  "marquee__chip group/chip inline-flex items-center justify-center w-172 gap-8 h-30 px-12 rounded-[--spacing(4)] bg-pw-black shadow-[inset_0_0_0_--spacing(1)_var(--pw-screen-edge)] text-pw-ice font-pw-mono text-14 font-bold tracking-[0.14em] whitespace-nowrap";

const LAMP =
  "marquee__lamp size-9 rounded-full bg-pw-warn shadow-[0_0_--spacing(8)_var(--pw-warn)] group-data-[cabinet-state=owner]/chip:bg-pw-ok group-data-[cabinet-state=owner]/chip:shadow-[0_0_--spacing(8)_var(--pw-ok)] group-data-[cabinet-state=visitor]/chip:bg-pw-ice group-data-[cabinet-state=visitor]/chip:shadow-[0_0_--spacing(8)_var(--pw-ice)] group-data-[cabinet-state=service]/chip:bg-pw-cobalt-hi group-data-[cabinet-state=service]/chip:shadow-[0_0_--spacing(8)_var(--pw-cobalt)]";

const BODY =
  "machine__body grid grid-cols-[minmax(0,1fr)_--spacing(240)] gap-10 min-h-0 max-desk:contents";

const BEZEL =
  "bezel relative min-h-0 p-14 rounded-[--spacing(12)] bg-[linear-gradient(180deg,var(--pw-graphite),var(--pw-graphite-lo))] shadow-[inset_0_--spacing(1)_0_rgb(255_255_255/12%),inset_0_0_0_--spacing(1)_var(--pw-black),0_--spacing(2)_0_rgb(0_0_0/35%)] max-desk:p-10";

const SCREW =
  "screw absolute size-10 rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--pw-steel-hi),var(--pw-steel-lo)_75%)] shadow-[inset_0_--spacing(-1)_--spacing(1)_rgb(0_0_0/40%),0_--spacing(1)_0_rgb(255_255_255/15%)] before:absolute before:top-1/2 before:left-1/2 before:w-6 before:h-1.5 before:rounded-[--spacing(1)] before:bg-pw-graphite-lo before:[transform:translate(-50%,-50%)_rotate(28deg)] after:absolute after:top-1/2 after:left-1/2 after:w-6 after:h-1.5 after:rounded-[--spacing(1)] after:bg-pw-graphite-lo after:[transform:translate(-50%,-50%)_rotate(118deg)]";

const DISPLAY =
  "display relative h-full overflow-hidden rounded-[--spacing(7)] bg-(image:--pw-lcd) shadow-[inset_0_0_0_--spacing(2)_var(--pw-black),inset_0_0_--spacing(30)_var(--pw-cobalt-glow)] text-pw-ink text-16";

const GLARE =
  "display__glare absolute inset-0 bg-[linear-gradient(118deg,rgb(255_255_255/7%)_0%,rgb(255_255_255/1.5%)_30%,transparent_31%),repeating-linear-gradient(180deg,rgb(156_194_255/3%)_0_--spacing(1),transparent_--spacing(1)_--spacing(3))] pointer-events-none";

const SIGN =
  "bezel__sign absolute z-3 top-70 left-1/2 px-26 py-14 border-[length:--spacing(3)] border-solid border-pw-etch rounded-[--spacing(4)] bg-pw-warn shadow-[0_--spacing(10)_--spacing(18)_rgb(0_0_0/50%)] text-pw-etch font-pw-mono text-26 font-extrabold tracking-[0.14em] whitespace-nowrap [transform:translateX(-50%)_rotate(-4deg)] before:absolute before:bottom-full before:left-[18%] before:w-2 before:h-64 before:bg-pw-steel-mid before:[transform:rotate(24deg)] before:origin-bottom after:absolute after:bottom-full after:right-[18%] after:w-2 after:h-64 after:bg-pw-steel-mid after:[transform:rotate(-24deg)] after:origin-bottom";

const LOCK =
  "machine__lock absolute top-1/2 -right-9 z-2 grid place-items-center w-14 h-52 rounded-[--spacing(7)] bg-(image:--pw-brushed) shadow-[0_--spacing(1)_0_rgb(0_0_0/40%),inset_0_--spacing(1)_0_var(--pw-highlight)] [transform:translateY(-50%)] max-desk:hidden";

const LOCK_HOLE =
  "w-6 h-12 rounded-[--spacing(3)_--spacing(3)_--spacing(1)_--spacing(1)] bg-pw-etch";

const READY = new Set(["idle", "selected", "granted"]);

function lights(machine: MachineProps["machine"]): {
  ready: boolean;
  busy: boolean;
  denied: boolean;
} {
  const status = machine?.["data-status"];
  return {
    ready: status === undefined || READY.has(status),
    busy: machine?.["data-busy"] === "true",
    denied: status === "denied",
  };
}

export function Machine(props: MachineProps): ReactNode {
  const Brand = props.headingBrand ? "h1" : "p";
  const label = `${props.siteName} vending machine`;
  const main = props.main ?? true;
  const camera = (
    <>
      {props.settled ? null : (
        <script dangerouslySetInnerHTML={{ __html: CAMERA_HINT_SCRIPT }} />
      )}
      <div
        ref={props.cameraRef}
        className={CAMERA}
        data-camera
        data-framing={props.framing}
        suppressHydrationWarning
      >
        <div
          ref={props.machineRef}
          className={MACHINE}
          data-machine
          {...props.machine}
        >
          <div className={MARQUEE} data-part="marquee">
            <span className={BOLT} aria-hidden="true" />
            <Brand className={BRAND}>{props.siteName.toUpperCase()}</Brand>
            <div className={TICKER} data-part="ticker" aria-hidden="true">
              <span
                ref={props.tickerRef}
                className={TICKER_TEXT}
                data-ticker-text
              >
                {props.ticker}
              </span>
            </div>
            <span
              className={CHIP}
              data-part="chip"
              data-cabinet-state={props.chip.state}
            >
              <span className={LAMP} aria-hidden="true" />
              <span data-cabinet-word>{props.chip.word}</span>
            </span>
            <span className={BOLT} aria-hidden="true" />
          </div>
          <div className={BODY}>
            <section className={BEZEL} data-part="bezel" aria-label="Screen">
              <span
                className={`${SCREW} screw--tl top-3 left-3`}
                aria-hidden="true"
              />
              <span
                className={`${SCREW} screw--tr top-3 right-3`}
                aria-hidden="true"
              />
              <span
                className={`${SCREW} screw--bl bottom-3 left-3`}
                aria-hidden="true"
              />
              <span
                className={`${SCREW} screw--br right-3 bottom-3`}
                aria-hidden="true"
              />
              <div className={DISPLAY} data-part="display">
                {props.display}
                <span className={GLARE} aria-hidden="true" />
              </div>
              {props.sign === undefined ? null : (
                <span className={SIGN} aria-hidden="true">
                  {props.sign}
                </span>
              )}
              <span className={LOCK} data-part="lock" aria-hidden="true">
                <i className={LOCK_HOLE} />
              </span>
            </section>
            <Strip
              lcd={props.lcd}
              keypad={props.keypad}
              lit={lights(props.machine)}
            />
          </div>
          <Base
            siteName={props.siteName}
            rootOrigin={props.rootOrigin}
            inert={props.plateInert ?? props.framing === "screen"}
            sound={props.sound}
            tray={props.tray}
          />
          <Feet />
        </div>
      </div>
    </>
  );
  const room = `${props.fixed ? "fixed inset-0 print:hidden" : "relative"} ${ROOM}`;
  return main ? (
    <main className={room} aria-label={label}>
      {camera}
    </main>
  ) : (
    <div className={room} role="region" aria-label={label}>
      {camera}
    </div>
  );
}
