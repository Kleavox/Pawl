import type { PublicView } from "@pawl/registry";
import {
  arrivalFraming,
  Bar,
  Body,
  cleanCamHint,
  Foot,
  Machine,
  Screen,
  settle,
  SoundSwitch,
  View,
} from "@pawl/ui";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { Tiles } from "../cabinet/Tiles";
import { toMachineModel } from "../estate-adapter";
import { contactAddress } from "../legal-facts";
import { greeting } from "../machine/copy";
import { initialState } from "../machine/state";
import { crumpleInto, holdOut, printOut } from "../receipt";
import { useSound } from "../sound";
import { Privacy } from "./Privacy";
import { Sheet } from "./Sheet";
import { Terms } from "./Terms";

const TITLES = { privacy: "Privacy policy", terms: "Terms of service" };

function assign(url: string): void {
  window.location.assign(url);
}

function Shelf(props: { site: PublicView }): ReactNode {
  const state = initialState("guest", props.site.bays);
  const model = toMachineModel(
    { authenticated: false },
    null,
    props.site.bays,
    [],
    props.site.site.name,
  );
  return (
    <View name="products" hidden={false} aria-label="Products" inert>
      <Bar where={greeting(state, model)} />
      <Body variant="tiles">
        <Tiles state={state} model={model} onTake={() => undefined} />
      </Body>
      <Foot hint="" />
    </View>
  );
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
  const paper = useRef<HTMLElement>(null);
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
    const held = sheet.current;
    if (held === null) return;
    void printOut(held, camera.current).then(() =>
      paper.current?.focus({ preventScroll: true }),
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
        machine={{ "data-status": "idle", "data-view": "products" }}
        main={false}
        settled
        fixed
        cameraRef={camera}
        machineRef={machine}
        display={
          <Screen>
            <Shelf site={props.site} />
          </Screen>
        }
      />
      <Sheet
        from="feed"
        as="main"
        labelledBy="receipt-title"
        sheetRef={sheet}
        paperRef={paper}
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
