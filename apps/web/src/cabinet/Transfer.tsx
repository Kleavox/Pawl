import { PW_BUTTON } from "@pawl/ui";
import { useEffect, useRef, type ReactNode } from "react";

import { productOf, shapeOf } from "../machine/copy";
import type { MachineState } from "../machine/state";

const DIALOG =
  "screen-transfer fixed z-120 inset-0 grid w-screen max-w-none h-dvh max-h-none m-0 p-0 border-0 bg-[rgb(6_16_31/94%)] text-pw-ink opacity-0 overflow-hidden pointer-events-none invisible [transition:opacity_var(--pw-t-view)_var(--pw-ease-mech),visibility_0s_linear_var(--pw-t-view)] backdrop:bg-transparent [&:not([data-transfer=none])]:opacity-100 [&:not([data-transfer=none])]:pointer-events-auto [&:not([data-transfer=none])]:visible [&:not([data-transfer=none])]:[transition:opacity_var(--pw-t-view)_var(--pw-ease-mech),visibility_0s]";

const GRID = `screen-transfer__grid absolute -inset-[50%] [background:linear-gradient(var(--pw-screen-line)_1px,transparent_1px)_0_0/40px_40px,linear-gradient(90deg,var(--pw-screen-line)_1px,transparent_1px)_0_0/40px_40px] [transform:perspective(600px)_rotateX(58deg)] opacity-60 [[data-transfer]:not([data-transfer=none])_&]:animate-[transfer-grid_var(--pw-t6)_var(--pw-ease-mech)_1_both]`;

const CARTRIDGE = `screen-transfer__cartridge absolute top-1/2 left-1/2 grid justify-items-center gap-[18px] w-[min(420px,86vw)] pt-[28px] px-[24px] pb-[22px] border border-solid border-pw-cobalt rounded-[14px_14px_8px_8px] bg-pw-graphite-lo bg-[linear-gradient(165deg,var(--pw-graphite),var(--pw-graphite-lo))] shadow-[0_0_0_6px_rgb(47_107_255/18%),0_30px_80px_rgb(0_0_0/70%)] [transform:translate(-50%,-50%)] [[data-transfer]:not([data-transfer=none])_&]:animate-[cartridge-to-screen_var(--pw-t6)_var(--pw-ease-mech)_1_both] [[data-transfer-shape=wide]_&]:rounded-[6px_16px_6px_6px]`;

const RAIL_BAR = `w-[34px] h-[4px] rounded-[2px] bg-pw-screen-edge [[data-transfer]:not([data-transfer=none])_&]:animate-[transfer-rail_var(--pw-t6)_linear_1_both]`;

export function Transfer(props: {
  state: MachineState;
  onCancel: () => void;
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  const bay = props.state.screenTransfer;
  useEffect(() => {
    const node = dialog.current;
    if (node === null) return;
    if (bay !== null && !node.open) node.showModal();
    if (bay === null && node.open) node.close();
  }, [bay]);
  return (
    <dialog
      ref={dialog}
      className={DIALOG}
      data-transfer={bay ?? "none"}
      data-transfer-shape={shapeOf(props.state.catalog, bay)}
      aria-label="Opening the selected application"
      onCancel={(event) => {
        event.preventDefault();
        props.onCancel();
      }}
    >
      <span className={GRID} aria-hidden="true" />
      <div className={CARTRIDGE}>
        <span
          className="screen-transfer__sticker w-full h-[8px] rounded-[4px] bg-pw-cobalt"
          aria-hidden="true"
        />
        <div className="screen-transfer__copy grid justify-items-center gap-[6px] text-center">
          <span className="text-pw-ice font-pw-mono text-rem-label font-bold tracking-[0.2em] uppercase">
            Route established
          </span>
          <strong
            className="font-pw-display text-[clamp(2rem,8vw,3.25rem)] font-bold tracking-[0.12em]"
            data-transfer-name
          >
            {bay === null ? "PAWL" : productOf(props.state.catalog, bay)}
          </strong>
          <small className="text-pw-ink-dim font-pw-mono text-rem-label tracking-[0.08em]">
            Opening it now, PAWL-GW-01
          </small>
        </div>
        <span
          className="screen-transfer__rail flex gap-[6px]"
          aria-hidden="true"
        >
          <i className={RAIL_BAR} />
          <i className={`${RAIL_BAR} [animation-delay:0.2s]`} />
          <i className={`${RAIL_BAR} [animation-delay:0.4s]`} />
        </span>
      </div>
      <button
        className={`screen-transfer__cancel ${PW_BUTTON} absolute bottom-[max(24px,env(safe-area-inset-bottom))] left-1/2 min-w-[140px] [transform:translateX(-50%)] active:[transform:translateX(-50%)_translateY(1px)]`}
        type="button"
        data-transfer-cancel
        onClick={props.onCancel}
      >
        Cancel
      </button>
    </dialog>
  );
}
