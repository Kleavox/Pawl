import type { PublicView } from "@pawl/registry";
import {
  Bar,
  Body,
  Eyebrow,
  Foot,
  leave,
  Machine,
  Note,
  Screen,
  settle,
  shouldAnimateClick,
  SoundSwitch,
  Step,
  Title,
  useCameraArrival,
  View,
  withCamHint,
} from "@pawl/ui";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { contactAddress } from "../legal-facts";
import { scrollBack, tearOff } from "../receipt";
import { useSound } from "../sound";
import { Privacy } from "./Privacy";
import { Terms } from "./Terms";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const TITLES = { privacy: "Privacy policy", terms: "Terms of service" };

const FEED =
  "receipt-feed fixed z-2 top-[26svh] bottom-0 left-[calc(50dvw_-_var(--paper)_/_2_-_var(--g))] w-[calc(var(--paper)_+_2_*_var(--g))] [--k:calc(var(--u)*var(--printer-s))] [--paper:calc((var(--slot-w)_-_12)_*_var(--k))] [--g:clamp(0px,calc((100dvw_-_var(--paper))_/_2),80px)] before:absolute before:z-1 before:top-0 before:right-(--g) before:left-(--g) before:h-[calc(5*var(--k))] before:bg-[linear-gradient(180deg,rgb(0_0_0/38%),transparent)] before:pointer-events-none print:static print:w-auto print:before:hidden";

const FRAME =
  "h-full overflow-y-auto overflow-x-hidden px-(--g) [scrollbar-width:thin] [scrollbar-color:var(--pw-steel-lo)_transparent] origin-top [transition:transform_90ms_cubic-bezier(0.2,0.8,0.2,1)] data-[torn]:will-change-transform data-[torn=jerk]:[transform:translateY(calc(6*var(--u)))] data-[torn=rip]:animate-[receipt-rip_120ms_ease-out_1_both] data-[torn=fall]:animate-[receipt-fall_380ms_ease-in_1_both] motion-reduce:animate-none motion-reduce:transition-none print:h-auto print:overflow-visible print:px-0";

const PAPER =
  "receipt relative -mt-[calc(12*var(--k))] pt-[calc(12*var(--k)_+_26px)] px-[clamp(14px,6%,28px)] pb-[46px] bg-pw-paper bg-[repeating-linear-gradient(180deg,rgb(0_0_0/1.6%)_0_1px,transparent_1px_4px),linear-gradient(90deg,rgb(0_0_0/5%),transparent_5%,transparent_95%,rgb(0_0_0/5%))] shadow-[0_26px_50px_var(--pw-shade)] text-pw-paper-ink font-pw-serif text-[1.0625rem] leading-[1.6] [mask:linear-gradient(var(--pw-black)_0_0)_top/100%_calc(100%_-_12px)_no-repeat,conic-gradient(from_-45deg_at_bottom,transparent,var(--pw-black)_1deg_89deg,transparent_90deg)_bottom/18px_12px_repeat-x] origin-top animate-[receipt-feed_540ms_steps(24,end)_1_both] motion-reduce:animate-none [[data-torn]_&]:animate-none [[data-torn]_&]:[mask:conic-gradient(from_135deg_at_top,transparent,var(--pw-black)_1deg_89deg,transparent_90deg)_top/14px_7px_repeat-x,linear-gradient(var(--pw-black)_0_0)_0_7px/100%_calc(100%_-_19px)_no-repeat,conic-gradient(from_-45deg_at_bottom,transparent,var(--pw-black)_1deg_89deg,transparent_90deg)_bottom/18px_12px_repeat-x] [&_h1]:m-0 [&_h1]:font-pw-mono [&_h1]:text-[clamp(1.375rem,4vw,1.75rem)] [&_h1]:font-extrabold [&_h1]:tracking-[0.08em] [&_h1]:leading-[1.15] [&_h1]:uppercase [&_h2]:mt-0 [&_h2]:mb-[8px] [&_h2]:font-pw-mono [&_h2]:text-rem-small [&_h2]:font-extrabold [&_h2]:tracking-[0.1em] [&_h2]:uppercase [&_section]:mt-[26px] [&_p]:m-0 [&_p]:mb-[10px] [&_ul]:m-0 [&_ul]:mb-[10px] [&_ul]:pl-[1.2em] [&_li]:mb-[6px] marker:text-pw-paper-dim marker:content-['–_'] [&_a:not(.pw-button)]:text-pw-cobalt-lo [&_a:not(.pw-button)]:decoration-1 [&_a:not(.pw-button)]:underline-offset-[3px] [&_a:not(.pw-button)]:[overflow-wrap:anywhere] [&_code]:px-[4px] [&_code]:py-[1px] [&_code]:rounded-[3px] [&_code]:bg-[rgb(0_0_0/6%)] [&_code]:font-pw-mono [&_code]:text-[0.85em] [&_code]:[overflow-wrap:anywhere] max-desk:text-[1rem] print:m-0 print:pt-0 print:shadow-none print:[mask:none] print:animate-none";

function reducedMotion(): boolean {
  try {
    return globalThis.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

export function ReceiptPage(props: {
  site: PublicView;
  kind: "privacy" | "terms";
  hosts: { rootHost: string; passHost: string };
}): ReactNode {
  const camera = useRef<HTMLDivElement>(null);
  const machine = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const feed = useRef<HTMLElement>(null);
  const tearing = useRef(false);
  const sound = useSound();
  const title = TITLES[props.kind];
  const facts = {
    siteName: props.site.site.name,
    rootHost: props.hosts.rootHost,
    passHost: props.hosts.passHost,
    contact: contactAddress(props.hosts.rootHost),
  };

  const putBack = useCallback((): void => {
    tearing.current = false;
    if (machine.current !== null) delete machine.current.dataset.leaving;
    if (frame.current !== null) delete frame.current.dataset.torn;
    if (camera.current !== null) {
      void settle(camera.current, "printer", "printer");
    }
  }, []);

  useCameraArrival(camera, "printer", {
    onRestore: putBack,
    direct: "printer",
  });

  useEffect(() => {
    const paper = feed.current;
    if (paper === null) return;
    const tear = async (href: string): Promise<void> => {
      if (
        tearing.current ||
        camera.current === null ||
        frame.current === null
      ) {
        return;
      }
      tearing.current = true;
      const reduced = reducedMotion();
      const paperFrame = frame.current;
      const lens = camera.current;
      try {
        await scrollBack(paperFrame, { reduced });
        if (machine.current !== null) machine.current.dataset.leaving = "tear";
        await tearOff(paperFrame, { reduced });
        await leave(lens, "printer", withCamHint(href, "printer"), {
          durationMs: 0,
          reduced,
          stay: putBack,
        });
      } catch {
        window.location.assign(href);
      }
    };
    const click = (event: MouseEvent): void => {
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[data-tear]")
          : null;
      if (link === null || !shouldAnimateClick(event)) return;
      event.preventDefault();
      void tear(link.href);
    };
    paper.addEventListener("click", click);
    return () => paper.removeEventListener("click", click);
  }, [putBack]);

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
            <View name="receipt" hidden={false} aria-label="Printer">
              <Bar where="RECEIPT">
                <Step>PRINTED</Step>
              </Bar>
              <Body variant="center">
                <Eyebrow>Printed</Eyebrow>
                <Title as="p">Your receipt is below</Title>
                <Note>Tear it off when you are done.</Note>
              </Body>
              <Foot hint="Tear it off at the slot" />
            </View>
          </Screen>
        }
      />
      <main ref={feed} className={FEED} aria-labelledby="receipt-title">
        <div
          ref={frame}
          className={FRAME}
          data-receipt-frame
          tabIndex={0}
          aria-label="Receipt"
        >
          <article className={PAPER} data-receipt>
            {props.kind === "privacy" ? (
              <Privacy {...facts} />
            ) : (
              <Terms {...facts} />
            )}
          </article>
        </div>
      </main>
    </>
  );
}
