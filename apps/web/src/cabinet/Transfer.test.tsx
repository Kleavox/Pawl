import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CATALOG } from "../machine/catalog.testkit";
import { initialState, reduce, type MachineState } from "../machine/state";
import { Transfer } from "./Transfer";

function delivered(): MachineState {
  return reduce(
    reduce(initialState("owner", CATALOG), { type: "select", bay: "1" }),
    { type: "tray-ready" },
  );
}

describe("Transfer", () => {
  it("opens the bridge with showModal, never as an ordinary panel, and only once", () => {
    const modal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const plain = vi.spyOn(HTMLDialogElement.prototype, "show");
    const resting = delivered();
    const { container, rerender } = render(
      <Transfer state={resting} onCancel={vi.fn()} />,
    );
    const bridge = container.querySelector("dialog")!;
    expect(bridge.open).toBe(false);
    expect(modal).not.toHaveBeenCalled();
    const bridging = reduce(resting, { type: "activate-tray" });
    rerender(<Transfer state={bridging} onCancel={vi.fn()} />);
    rerender(<Transfer state={bridging} onCancel={vi.fn()} />);
    expect(bridge.open).toBe(true);
    expect(modal).toHaveBeenCalledTimes(1);
    expect(plain).not.toHaveBeenCalled();
    modal.mockRestore();
    plain.mockRestore();
  });

  it("closes the bridge when the transfer is cancelled, and never closes one that was not open", () => {
    const closed = vi.spyOn(HTMLDialogElement.prototype, "close");
    const { container, rerender } = render(
      <Transfer state={initialState("guest", CATALOG)} onCancel={vi.fn()} />,
    );
    rerender(
      <Transfer state={initialState("guest", CATALOG)} onCancel={vi.fn()} />,
    );
    expect(closed).not.toHaveBeenCalled();
    const bridging = reduce(delivered(), { type: "activate-tray" });
    rerender(<Transfer state={bridging} onCancel={vi.fn()} />);
    rerender(
      <Transfer
        state={reduce(bridging, { type: "cancel" })}
        onCancel={vi.fn()}
      />,
    );
    const bridge = container.querySelector("dialog")!;
    expect(bridge.open).toBe(false);
    expect(bridge.getAttribute("data-transfer")).toBe("none");
    closed.mockRestore();
  });

  it("cancels on Escape instead of letting the dialog close itself", () => {
    const cancel = vi.fn();
    const { container } = render(
      <Transfer
        state={reduce(delivered(), { type: "activate-tray" })}
        onCancel={cancel}
      />,
    );
    const event = new Event("cancel", { cancelable: true });
    container.querySelector("dialog")!.dispatchEvent(event);
    expect(cancel).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });
});
