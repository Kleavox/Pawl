import { PW_BUTTON } from "@pawl/ui";
import { createElement, type ReactNode, type Ref } from "react";

const SHEET =
  "receipt-sheet group/sheet fixed inset-0 z-2 pointer-events-none [--k:calc(var(--u)*var(--printer-s))] [--paper:calc((var(--slot-w)_-_12)_*_var(--k))] [--g:clamp(0px,calc((100dvw_-_var(--paper))_/_2),80px)] [--lift:calc(var(--slot-line)_-_var(--margin)_-_52px)] print:static";

const DIM =
  "absolute inset-0 bg-[rgb(6_16_31/78%)] opacity-0 [transition:opacity_620ms_var(--ease-pull)] group-data-[stage=hand]/sheet:opacity-100 group-data-[stage=crumple]/sheet:opacity-100 group-data-[stage=ball]/sheet:[transition:opacity_450ms_linear] print:hidden";

const HELD =
  "absolute inset-x-0 top-(--margin) bottom-(--margin) grid grid-rows-[44px_minmax(0,1fr)] gap-[8px] w-[calc(var(--paper)_+_2_*_var(--g))] mx-auto [transition:transform_620ms_var(--ease-pull)] group-data-[stage=slot]/sheet:[transform:translateY(var(--lift))] group-data-[stage=feed]/sheet:[transform:translateY(var(--lift))] group-data-[stage=jerk]/sheet:[transform:translateY(calc(var(--lift)_+_6_*_var(--u)))] group-data-[stage=jerk]/sheet:[transition:transform_90ms_var(--pw-ease-mech)] group-data-[stage=rip]/sheet:[transform:translateY(calc(var(--lift)_+_6_*_var(--u)))_rotate(1deg)] group-data-[stage=rip]/sheet:[transition:transform_120ms_ease-out] group-data-[stage=crumple]/sheet:animate-[receipt-crumple_260ms_var(--pw-ease-mech)_1_both] group-data-[stage=ball]/sheet:opacity-0 group-data-[stage=gone]/sheet:opacity-0 print:static print:block print:w-auto print:[transform:none]!";

const TOP = "flex justify-end items-end px-(--g) print:hidden";

const CRUMPLE = `${PW_BUTTON} pointer-events-auto font-pw-mono tracking-[0.08em] invisible group-data-[stage=hand]/sheet:visible`;

const FRAME =
  "h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-(--g) group-data-[stage=slot]/sheet:pb-(--lift) group-data-[stage=feed]/sheet:pb-(--lift) pointer-events-auto focus-visible:[outline:none] [scrollbar-width:none] print:h-auto print:overflow-visible print:px-0";

const INNER =
  "relative [[data-receipt-frame]:focus-visible_&]:[outline:--spacing(2)_solid_var(--pw-cobalt-hi)] [[data-receipt-frame]:focus-visible_&]:[outline-offset:4px]";

const SHADOW =
  "absolute inset-x-0 top-[calc(4*var(--k))] bottom-0 rounded-[2px] shadow-[calc(10*var(--k))_calc(16*var(--k))_calc(24*var(--k))_rgb(0_0_0/55%)] pointer-events-none print:hidden";

const PAPER =
  "receipt relative pt-[26px] before:absolute before:inset-x-0 before:top-0 before:h-[calc(6*var(--k))] before:bg-[linear-gradient(180deg,rgb(0_0_0/38%),transparent)] before:pointer-events-none print:before:hidden px-[clamp(14px,6%,28px)] pb-[46px] bg-pw-paper bg-[repeating-linear-gradient(180deg,rgb(0_0_0/1.6%)_0_1px,transparent_1px_4px),linear-gradient(90deg,rgb(0_0_0/5%),transparent_5%,transparent_95%,rgb(0_0_0/5%))] text-pw-paper-ink font-pw-serif text-[1.0625rem] leading-[1.6] receipt-edge origin-top group-data-[stage=slot]/sheet:invisible group-data-[stage=feed]/sheet:animate-[receipt-feed_540ms_steps(24,end)_1_both] group-data-[stage=rip]/sheet:receipt-torn group-data-[stage=hand]/sheet:receipt-torn group-data-[stage=crumple]/sheet:receipt-torn [&_h1]:m-0 [&_h1]:font-pw-mono [&_h1]:text-[clamp(1.375rem,4vw,1.75rem)] [&_h1]:font-extrabold [&_h1]:tracking-[0.08em] [&_h1]:leading-[1.15] [&_h1]:uppercase [&_h2]:mt-0 [&_h2]:mb-[8px] [&_h2]:font-pw-mono [&_h2]:text-rem-small [&_h2]:font-extrabold [&_h2]:tracking-[0.1em] [&_h2]:uppercase [&_section]:mt-[26px] [&_p]:m-0 [&_p]:mb-[10px] [&_ul]:m-0 [&_ul]:mb-[10px] [&_ul]:pl-[1.2em] [&_li]:mb-[6px] marker:text-pw-paper-dim marker:content-['–_'] [&_a:not(.pw-button)]:text-pw-cobalt-lo [&_a:not(.pw-button)]:decoration-1 [&_a:not(.pw-button)]:underline-offset-[3px] [&_a:not(.pw-button)]:[overflow-wrap:anywhere] [&_code]:px-[4px] [&_code]:py-[1px] [&_code]:rounded-[3px] [&_code]:bg-[rgb(0_0_0/6%)] [&_code]:font-pw-mono [&_code]:text-[0.85em] [&_code]:[overflow-wrap:anywhere] max-desk:text-[1rem] print:pt-0 print:[mask:none] print:animate-none";

const CREASES =
  "absolute inset-x-(--g) top-[52px] bottom-0 opacity-0 pointer-events-none [transition:opacity_200ms_linear] group-data-[stage=crumple]/sheet:opacity-100 print:hidden";

const BALL =
  "absolute top-1/2 left-1/2 -mt-[22px] -ml-[22px] size-[44px] invisible group-data-[stage=ball]/sheet:visible group-data-[stage=ball]/sheet:animate-[ball-across_450ms_linear_1_both] print:hidden";

const DROP =
  "block size-full group-data-[stage=ball]/sheet:animate-[ball-drop_450ms_cubic-bezier(0.35,-0.6,0.75,1)_1_both]";

const FOLDS = [
  "M0 22 L38 30 L61 17 L100 27",
  "M0 58 L27 50 L55 65 L100 54",
  "M0 85 L44 91 L100 79",
  "M18 0 L27 41 L13 72 L22 100",
  "M71 0 L62 34 L79 66 L68 100",
];

export function Sheet(props: {
  from: "slot" | "feed";
  as: "main" | "div";
  labelledBy: string;
  sheetRef: Ref<HTMLDivElement>;
  frameRef: Ref<HTMLDivElement>;
  onCrumple: () => void;
  children: ReactNode;
}): ReactNode {
  return createElement(
    props.as,
    {
      ref: props.sheetRef,
      className: SHEET,
      "data-receipt-sheet": "",
      "data-stage": props.from,
      "aria-labelledby": props.labelledBy,
      suppressHydrationWarning: true,
    },
    <>
      <div className={DIM} data-receipt-dim aria-hidden="true" />
      <div className={HELD} data-receipt-held>
        <div className={TOP}>
          <button
            className={CRUMPLE}
            type="button"
            data-receipt-crumple
            aria-label="Crumple the receipt"
            onClick={props.onCrumple}
          >
            Crumple ✕
          </button>
        </div>
        <div
          ref={props.frameRef}
          className={FRAME}
          data-receipt-frame
          tabIndex={0}
          aria-label="Receipt"
        >
          <div className={INNER} data-receipt-inner>
            <div className={SHADOW} aria-hidden="true" />
            <article className={PAPER} data-receipt>
              {props.children}
            </article>
          </div>
        </div>
        <svg
          className={CREASES}
          data-receipt-creases
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {FOLDS.map((fold) => (
            <path
              key={fold}
              d={fold}
              fill="none"
              className="stroke-pw-paper-dim"
              strokeOpacity="0.45"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <span className={BALL} data-receipt-ball aria-hidden="true">
        <svg className={DROP} viewBox="0 0 44 44">
          <polygon
            className="fill-pw-paper stroke-pw-paper-dim"
            strokeWidth="1.2"
            points="22,2 31,4 40,12 42,24 37,35 26,42 14,40 5,32 2,20 9,8"
          />
          <path
            className="stroke-pw-paper-dim"
            fill="none"
            strokeWidth="1"
            d="M9 8 L19 18 L14 30 M31 4 L24 17 L36 26 M19 18 L24 17 M14 30 L26 42 M36 26 L37 35"
          />
        </svg>
      </span>
    </>,
  );
}
