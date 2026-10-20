import { useLayoutEffect, useRef, type ReactNode, type Ref } from "react";

import { Audit, type AuditFacts } from "../receipt/Audit";
import {
  Delivery,
  type DeliveryActions,
  type DeliveryBody,
  type DeliveryFacts,
} from "../receipt/Delivery";
import { Sheet } from "../receipt/Sheet";

export type Delivered =
  | { printKey: number; facts: DeliveryFacts; body: DeliveryBody }
  | { printKey: number; audit: AuditFacts };

export type PaperActions = DeliveryActions & { crumple: () => void };

const DIALOG =
  "fixed inset-0 z-120 w-screen max-w-none h-dvh max-h-none m-0 p-0 border-0 bg-transparent overflow-hidden outline-none backdrop:bg-transparent";

export function DeliveryReceipt(props: {
  delivery: Delivered | null;
  siteName: string;
  copied: string | null;
  sheetRef?: Ref<HTMLDivElement>;
  paperRef?: Ref<HTMLElement>;
  on: PaperActions;
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = props.delivery !== null;
  useLayoutEffect(() => {
    const node = dialog.current;
    if (node === null) return;
    if (open && !node.open) {
      node.showModal();
      node.focus({ preventScroll: true });
    }
    if (!open && node.open) node.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className={DIALOG}
      data-delivery
      tabIndex={-1}
      aria-labelledby="delivery-title"
      onCancel={(event) => {
        event.preventDefault();
        props.on.crumple();
      }}
    >
      {props.delivery !== null && (
        <Sheet
          key={props.delivery.printKey}
          from="slot"
          as="div"
          labelledBy="delivery-title"
          sheetRef={props.sheetRef ?? null}
          paperRef={props.paperRef ?? null}
          onCrumple={props.on.crumple}
        >
          {"audit" in props.delivery ? (
            <Audit facts={props.delivery.audit} />
          ) : (
            <Delivery
              siteName={props.siteName}
              facts={props.delivery.facts}
              body={props.delivery.body}
              copied={props.copied}
              on={props.on}
            />
          )}
        </Sheet>
      )}
    </dialog>
  );
}
