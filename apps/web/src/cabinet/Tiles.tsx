import type { BayView } from "@pawl/registry";
import type { ReactNode } from "react";

import type { MachineModel } from "../estate-adapter";
import { tileFor, type TileView } from "../machine/copy";
import type { BayCode, MachineState } from "../machine/state";

const CODES = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

const GRID = "tiles grid grid-cols-3 grid-rows-3 gap-10 h-full max-desk:gap-6";

const TILE = "tile relative min-w-0 min-h-0 rounded-[--spacing(9)]";

const LAYOUT =
  "grid [grid-template-areas:'code_badge'_'art_art'_'name_name'] grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-6 w-full h-full px-12 py-10 border-0 rounded-[inherit] [font:inherit] text-left max-desk:[grid-template-areas:'art'_'name'_'badge'] max-desk:grid-cols-[minmax(0,1fr)] max-desk:grid-rows-[minmax(0,1fr)_auto_auto] max-desk:gap-3 max-desk:p-6";

const BUTTON_BASE = `tile__button relative ${LAYOUT} text-pw-ink cursor-pointer [transition:box-shadow_var(--pw-t-key)_var(--pw-ease-mech),background_var(--pw-t-key)_var(--pw-ease-mech)] [&&:focus-visible]:[outline:none] active:[transform:translateY(--spacing(1))]`;

const OPEN_FACE =
  "bg-[linear-gradient(180deg,rgb(91_140_255/12%),rgb(10_23_48/92%))] hover:bg-[linear-gradient(180deg,rgb(91_140_255/22%),rgb(10_23_48/92%))]";

const LOCKED_FACE =
  "bg-[linear-gradient(180deg,rgb(91_140_255/6%),rgb(10_23_48/92%))]";

const RESTING =
  "shadow-[inset_0_0_0_--spacing(1)_var(--pw-screen-edge)] focus-visible:shadow-[inset_0_0_0_--spacing(2)_var(--pw-ice),0_0_--spacing(14)_var(--pw-cobalt-glow)]";

const RINGED =
  "shadow-[inset_0_0_0_--spacing(2)_var(--pw-cobalt-hi),0_0_--spacing(18)_var(--pw-cobalt-glow)]";

const REFUSED =
  "shadow-[inset_0_0_0_--spacing(1)_var(--pw-screen-edge)] animate-[tile-denied_540ms_steps(1,end)_1_both] motion-reduce:animate-none motion-reduce:shadow-[inset_0_0_0_--spacing(2)_var(--pw-danger)]";

const CODE =
  "tile__code [grid-area:code] self-center [font:800_--spacing(14)/1_var(--pw-mono)] tracking-[0.1em] max-desk:[grid-area:art] max-desk:self-start max-desk:justify-self-start";

const NAME =
  "tile__name [grid-area:name] min-w-0 overflow-hidden [font:700_--spacing(15)/1.1_var(--pw-mono)] tracking-[0.08em] text-ellipsis whitespace-nowrap max-desk:text-14 max-desk:tracking-[0.04em]";

const ART_CELL = "tile__art [grid-area:art] grid place-items-center min-h-0";

const ART_SHAPE: Record<"tall" | "wide", string> = {
  tall: "relative block h-[min(100%,--spacing(64))] aspect-[3/4] border-[length:--spacing(2)] border-solid border-pw-graphite rounded-[--spacing(6)_--spacing(6)_--spacing(3)_--spacing(3)]",
  wide: "relative block h-[min(80%,--spacing(46))] aspect-[3/2] border-[length:--spacing(2)] border-solid border-pw-graphite rounded-[--spacing(3)_--spacing(8)_--spacing(3)_--spacing(3)]",
};

const ART_OPEN =
  "bg-[linear-gradient(180deg,var(--pw-label),var(--pw-label-lo))] shadow-[0_0_--spacing(14)_rgb(91_140_255/35%)] after:absolute after:right-[14%] after:bottom-[12%] after:left-[14%] after:h-4 after:rounded-[--spacing(2)]";

const ART_STRIPE: Record<string, string> = {
  warn: "after:bg-pw-warn",
  danger: "after:bg-pw-danger",
};

const ART_LOCKED =
  "bg-[linear-gradient(180deg,var(--pw-steel-mid),var(--pw-steel-lo))] before:absolute before:top-[42%] before:-right-4 before:-left-4 before:h-8 before:bg-[repeating-linear-gradient(135deg,var(--pw-label)_0_--spacing(5),var(--pw-etch-dim)_--spacing(5)_--spacing(10))]";

const ART_RELEASE =
  "animate-[art-release_900ms_var(--pw-ease-drop)_1_both] motion-reduce:animate-none";

const BADGE_BASE =
  "tile__badge [grid-area:badge] justify-self-end self-center inline-flex items-center gap-5 max-w-full h-22 px-6 overflow-hidden rounded-[--spacing(3)] bg-pw-black [font:700_--spacing(14)/1_var(--pw-mono)] tracking-[0.06em] whitespace-nowrap max-desk:justify-self-start max-desk:h-19 max-desk:px-4 max-desk:gap-3 max-desk:tracking-[0.02em]";

const DOT =
  "before:flex-none before:size-8 before:rounded-full before:shadow-[0_0_--spacing(6)_currentcolor]";

const BADGE_TONE: Record<string, string> = {
  ok: `text-pw-ink ${DOT} before:bg-pw-ok`,
  warn: `text-pw-warn ${DOT} before:bg-pw-warn`,
  danger: `text-pw-danger ${DOT} before:bg-pw-danger`,
  unknown: "text-pw-ink-dim",
  none: "text-pw-ink-dim",
  link: "text-pw-ice",
  locked:
    "text-pw-warn before:flex-none before:w-9 before:h-11 before:[background:linear-gradient(currentcolor,currentcolor)_0_100%/100%_60%_no-repeat,radial-gradient(circle_at_50%_100%,transparent_--spacing(2.2),currentcolor_--spacing(2.4)_--spacing(3.6),transparent_--spacing(3.8))_0_0/100%_50%_no-repeat]",
};

const EMPTY = `${TILE} tile--empty ${LAYOUT} bg-transparent shadow-[inset_0_0_0_--spacing(1)_var(--pw-screen-line)]`;

const EMPTY_NAME = `${NAME} text-pw-screen-edge max-desk:row-[2/4] max-desk:self-end`;

function face(view: TileView): string {
  const ring =
    view.state === "selected" || view.state === "releasing"
      ? RINGED
      : view.state === "denied"
        ? REFUSED
        : RESTING;
  return `${BUTTON_BASE} ${view.locked === "" ? OPEN_FACE : LOCKED_FACE} ${ring}`;
}

function art(bay: BayView, view: TileView): string {
  const shape = ART_SHAPE[bay.shape === "wide" ? "wide" : "tall"];
  const look =
    view.locked === ""
      ? `${ART_OPEN} ${ART_STRIPE[view.badge.severity] ?? "after:bg-pw-cobalt"}`
      : ART_LOCKED;
  const motion = view.state === "releasing" ? ART_RELEASE : "";
  return `${shape} ${look} ${motion}`;
}

function Tile(props: {
  bay: BayView;
  view: TileView;
  onTake: (bay: BayCode) => void;
}): ReactNode {
  const { bay, view } = props;
  return (
    <div
      className={TILE}
      data-tile={bay.code}
      data-state={view.state}
      data-lit={String(view.lit)}
      data-locked={view.locked}
    >
      <button
        className={face(view)}
        type="button"
        data-cartridge={bay.code}
        data-href={bay.href}
        aria-label={view.label}
        onClick={() => props.onTake(bay.code)}
      >
        <span className={`${CODE} text-pw-ice`}>
          {bay.code.padStart(2, "0")}
        </span>
        <span className="tile__lock hidden" aria-hidden="true" />
        <span
          className={`${ART_CELL} tile__art--${bay.shape}`}
          aria-hidden="true"
        >
          <i className={art(bay, view)} />
        </span>
        <span className={`${NAME} text-pw-ink`}>{bay.product}</span>
        <span
          className={`${BADGE_BASE} ${BADGE_TONE[view.badge.severity] ?? "text-pw-ice"}`}
          data-badge
          data-severity={view.badge.severity}
        >
          {view.badge.text}
        </span>
      </button>
    </div>
  );
}

export function Tiles(props: {
  state: MachineState;
  model: MachineModel;
  onTake: (bay: BayCode) => void;
}): ReactNode {
  const byCode = new Map(props.state.catalog.map((bay) => [bay.code, bay]));
  return (
    <div className={GRID} role="group" aria-label="Bays">
      {CODES.map((code) => {
        const bay = byCode.get(code);
        if (bay === undefined) {
          return (
            <div
              key={code}
              className={EMPTY}
              data-tile={code}
              aria-hidden="true"
            >
              <span className={`${CODE} text-pw-screen-edge`}>
                {code.padStart(2, "0")}
              </span>
              <span className={EMPTY_NAME}>—</span>
            </div>
          );
        }
        return (
          <Tile
            key={code}
            bay={bay}
            view={tileFor(props.state, props.model, bay)}
            onTake={props.onTake}
          />
        );
      })}
    </div>
  );
}
