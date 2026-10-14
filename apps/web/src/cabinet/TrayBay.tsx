import type { ReactNode } from "react";

import { productOf, shapeOf } from "../machine/copy";
import type { MachineState } from "../machine/state";

const FALLING =
  "falling-cartridge absolute z-1 bottom-10 left-1/2 grid place-items-center w-40 h-52 p-4 border-[length:--spacing(1)] border-solid border-pw-trim rounded-[--spacing(5)_--spacing(5)_--spacing(3)_--spacing(3)] bg-[linear-gradient(165deg,var(--pw-graphite),var(--pw-graphite-lo))] shadow-[0_--spacing(6)_--spacing(10)_rgb(0_0_0/70%)] opacity-0 pointer-events-none invisible data-[falling-shape=tall]:visible data-[falling-shape=wide]:visible data-[falling-shape=tall]:animate-[cartridge-drop_var(--pw-t6)_var(--pw-ease-drop)_1_both] data-[falling-shape=wide]:animate-[cartridge-tumble_var(--pw-t6)_var(--pw-ease-drop)_1_both] data-[falling-shape=wide]:w-60 data-[falling-shape=wide]:h-40 data-[falling-shape=wide]:rounded-[--spacing(3)_--spacing(7)_--spacing(3)_--spacing(3)] motion-reduce:animate-none";

const STICKER =
  "falling-cartridge__sticker grid place-items-center w-full h-full overflow-hidden rounded-[--spacing(3)] bg-[linear-gradient(180deg,var(--pw-label),var(--pw-label-lo))] text-pw-etch [font:700_--spacing(14)/1_var(--pw-mono)]";

const RESULT =
  "tray__result relative z-3 hidden items-center gap-14 [&:not([data-tray=none])]:flex [&:not([data-tray=none])]:animate-[tray-arrive_320ms_var(--pw-ease-mech)_1_both] motion-reduce:animate-none max-desk:gap-10";

const ITEM =
  "tray-item grid content-between w-max min-w-46 max-w-140 h-60 p-5 border-[length:--spacing(1)] border-solid border-pw-trim rounded-[--spacing(5)_--spacing(5)_--spacing(3)_--spacing(3)] bg-[linear-gradient(165deg,var(--pw-graphite),var(--pw-graphite-lo))] shadow-[0_--spacing(6)_--spacing(12)_rgb(0_0_0/60%)] text-pw-ink font-pw-mono [[data-tray-shape=wide]_&]:min-w-72 [[data-tray-shape=wide]_&]:h-46 [[data-tray-shape=wide]_&]:rounded-[--spacing(3)_--spacing(7)_--spacing(3)_--spacing(3)] max-desk:min-w-40 max-desk:h-52 max-desk:[[data-tray-shape=wide]_&]:min-w-56 max-desk:[[data-tray-shape=wide]_&]:h-40";

const ACTION =
  "tray-action min-h-56 px-18 border-[length:--spacing(1)] border-solid border-pw-cobalt rounded-[--spacing(6)] bg-pw-cobalt shadow-[0_--spacing(3)_0_var(--pw-cobalt-lo),0_0_--spacing(18)_var(--pw-cobalt-glow)] text-pw-white [font:700_--spacing(15)/1_var(--pw-mono)] tracking-[0.1em] cursor-pointer hover:bg-pw-cobalt-hi active:[transform:translateY(--spacing(2))] active:shadow-[0_--spacing(1)_0_var(--pw-cobalt-lo)]";

export function TrayBay(props: {
  state: MachineState;
  onTake: () => void;
}): ReactNode {
  const { state } = props;
  const releasing = state.status === "dispensing" ? state.selection : null;
  return (
    <>
      <span
        className={FALLING}
        data-falling={releasing ?? "none"}
        data-falling-shape={shapeOf(state.catalog, releasing)}
        aria-hidden="true"
      >
        <span className={STICKER}>
          <strong data-falling-name>
            {productOf(state.catalog, releasing)}
          </strong>
        </span>
      </span>
      <div
        className={RESULT}
        data-tray={state.tray ?? "none"}
        data-tray-shape={shapeOf(state.catalog, state.tray)}
      >
        <span className={ITEM} aria-hidden="true">
          <strong className="text-pw-ice text-14" data-tray-code>
            {state.tray ?? ""}
          </strong>
          <small
            className="overflow-hidden text-14 font-bold text-ellipsis whitespace-nowrap"
            data-tray-name
          >
            {productOf(state.catalog, state.tray)}
          </small>
        </span>
        <button
          className={ACTION}
          type="button"
          data-tray-action
          onClick={props.onTake}
        >
          TAKE DELIVERY
        </button>
      </div>
    </>
  );
}
