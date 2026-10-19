import type { PublicView } from "@pawl/registry";
import {
  arrivalFraming,
  cleanCamHint,
  Machine,
  Screen,
  settle,
  SoundSwitch,
} from "@pawl/ui";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { contactAddress } from "../legal-facts";
import { crumpleInto, holdOut, printOut } from "../receipt";
import { useSound } from "../sound";
import { Printed } from "./Printed";
import { Privacy } from "./Privacy";
import { Sheet } from "./Sheet";
import { Terms } from "./Terms";

const TITLES = { privacy: "Privacy policy", terms: "Terms of service" };

function assign(url: string): void {
  window.location.assign(url);
}

export function ReceiptPage(props: {
  site: PublicView;
  kind: "privacy" | "terms";
  hosts: { rootHost: string; passHost: string };
  navigate?: (url: string) => void;
}): ReactNode {
  const camera = useRef<HTMLDivElement>(null);
  const machine = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const navigate = useRef(props.navigate ?? assign);
  navigate.current = props.navigate ?? assign;
  const sound = useSound();
  const title = TITLES[props.kind];
  const facts = {
    siteName: props.site.site.name,
    rootHost: props.hosts.rootHost,
    passHost: props.hosts.passHost,
    contact: contactAddress(props.hosts.rootHost),
  };

  const crumple = useCallback(async (): Promise<void> => {
    if (sheet.current === null) return;
    if (await crumpleInto(sheet.current, machine.current)) {
      navigate.current("/");
    }
  }, []);

  useEffect(() => {
    cleanCamHint(window.location, window.history);
    const paper = sheet.current;
    if (paper === null) return;
    void printOut(paper, camera.current).then(() =>
      frame.current?.focus({ preventScroll: true }),
    );
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      void crumple();
    };
    const back = (event: PageTransitionEvent): void => {
      if (!event.persisted || sheet.current === null) return;
      holdOut(sheet.current);
      if (camera.current === null) return;
      void settle(
        camera.current,
        arrivalFraming(`#cam=${camera.current.dataset.framing ?? ""}`),
        "whole",
      );
    };
    document.addEventListener("keydown", escape);
    window.addEventListener("pageshow", back);
    return () => {
      document.removeEventListener("keydown", escape);
      window.removeEventListener("pageshow", back);
    };
  }, [crumple]);

  return (
    <>
      <Machine
        siteName={props.site.site.name}
        rootOrigin=""
        framing="printer"
        ticker="RECEIPT PRINTED · KEEP IT FOR YOUR RECORDS"
        chip={{ state: "service", word: "PRINTER" }}
        lcd={{ main: "RECEIPT PRINTED", sub: title.toUpperCase() }}
        keypad={{ mode: "service", lit: new Set() }}
        sound={<SoundSwitch pressed={sound.on} onToggle={sound.toggle} />}
        machine={{ "data-status": "idle", "data-view": "receipt" }}
        main={false}
        settled
        fixed
        cameraRef={camera}
        machineRef={machine}
        display={
          <Screen>
            <Printed hidden={false} />
          </Screen>
        }
      />
      <Sheet
        from="feed"
        as="main"
        labelledBy="receipt-title"
        sheetRef={sheet}
        frameRef={frame}
        onCrumple={() => void crumple()}
      >
        {props.kind === "privacy" ? (
          <Privacy {...facts} />
        ) : (
          <Terms {...facts} />
        )}
      </Sheet>
    </>
  );
}
