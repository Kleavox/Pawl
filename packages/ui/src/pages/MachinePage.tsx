import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MachineKey } from "../machine/Keypad";
import { Credit } from "../machine/Credit";
import { Machine } from "../machine/Machine";
import { PAGE_CSS } from "../page-css";

const SCREEN =
  "page-screen absolute inset-0 grid grid-rows-[--spacing(38)_minmax(0,1fr)_--spacing(34)] text-pw-ink font-pw-ui";

const BAR =
  "page-bar flex items-center justify-between gap-12 min-w-0 pr-10 pl-16 [border-bottom:--spacing(1)_solid_var(--pw-screen-line)] text-pw-ice [font:700_--spacing(14)/1_var(--pw-mono)] tracking-[0.14em] uppercase whitespace-nowrap";

const WHERE = "min-w-0 overflow-hidden text-ellipsis";

const TO_MACHINE =
  "flex-none inline-flex items-center h-30 px-12 border-[length:--spacing(1)] border-solid border-pw-cobalt rounded-[--spacing(4)] bg-pw-cobalt-wash text-pw-ice no-underline hover:bg-pw-cobalt hover:text-pw-white focus-visible:bg-pw-cobalt focus-visible:text-pw-white focus-visible:[outline:none]";

const VIEW =
  "page-view flex flex-col gap-12 min-h-0 overflow-y-auto overscroll-contain py-24 px-32 [scrollbar-color:var(--pw-cobalt)_transparent] [scrollbar-width:thin] text-16 leading-[1.5] *:shrink-0 max-desk:p-16 max-desk:text-15";

const VIEW_UNDER_SIGN =
  "page-view flex flex-col gap-12 min-h-0 overflow-y-auto overscroll-contain pt-116 pb-24 px-32 [scrollbar-color:var(--pw-cobalt)_transparent] [scrollbar-width:thin] text-16 leading-[1.5] *:shrink-0 max-desk:pb-16 max-desk:px-16 max-desk:text-15";

const FOOT =
  "page-foot grid place-items-center [border-top:--spacing(1)_solid_var(--pw-screen-line)] text-pw-ink-dim [font:600_--spacing(14)/1_var(--pw-mono)] tracking-[0.08em] uppercase";

export const EYEBROW =
  "m-0 text-pw-ice [font:700_--spacing(14)/1_var(--pw-mono)] tracking-[0.16em] uppercase";

export const EYEBROW_DANGER =
  "m-0 text-pw-danger [font:700_--spacing(14)/1_var(--pw-mono)] tracking-[0.16em] uppercase";

export const HEADING =
  "m-0 text-pw-white font-pw-display text-26 font-bold leading-[1.15] max-desk:[font-size:--spacing(21)]";

export const TEXT =
  "m-0 text-pw-ink-dim [&_strong]:text-pw-ink [&_strong]:font-semibold";

export const ACTIONS =
  "grid grid-cols-2 gap-10 mt-auto max-desk:grid-cols-[minmax(0,1fr)]";

export const BUTTON =
  "inline-flex items-center justify-center min-h-56 px-18 border-[length:--spacing(1)] border-solid border-pw-screen-edge rounded-[--spacing(8)] bg-pw-screen-hi text-pw-ink [font:700_--spacing(16)/1_var(--pw-ui)] no-underline cursor-pointer hover:border-pw-cobalt-hi focus-visible:[outline:--spacing(2)_solid_var(--pw-cobalt-hi)] focus-visible:[outline-offset:--spacing(2)]";

export const BUTTON_PRIMARY =
  "inline-flex items-center justify-center min-h-56 px-18 border-[length:--spacing(1)] border-solid border-pw-cobalt rounded-[--spacing(8)] bg-pw-cobalt shadow-[0_0_--spacing(14)_var(--pw-cobalt-glow)] text-pw-white [font:700_--spacing(16)/1_var(--pw-ui)] no-underline cursor-pointer focus-visible:[outline:--spacing(2)_solid_var(--pw-cobalt-hi)] focus-visible:[outline-offset:--spacing(2)]";

export type MachinePageProps = {
  title: string;
  status: string;
  sub?: string;
  where?: string;
  keys?: { clr?: MachineKey; go?: MachineKey };
  caption?: string;
  sign?: string;
  credit?: string;
  siteName?: string;
  rootOrigin?: string;
  children: ReactNode;
};

function MachinePage(props: MachinePageProps): ReactNode {
  const root = props.rootOrigin ?? "";
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <meta name="theme-color" content="#0a0f17" />
        <title>{props.title}</title>
        <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      </head>
      <body>
        <Machine
          siteName={props.siteName ?? "Pawl"}
          rootOrigin={root}
          framing="screen"
          ticker={props.status}
          chip={{ state: "service", word: "SERVICE MODE" }}
          lcd={{ main: props.status, sub: props.sub ?? "" }}
          keypad={{
            mode: "service",
            lit: new Set(["CLR", "GO"]),
            clr: props.keys?.clr,
            go: props.keys?.go,
            caption: props.caption,
          }}
          headingBrand={false}
          sign={props.sign}
          credit={<Credit text={props.credit ?? "FrEE"} />}
          settled
          machine={{ "data-view": "service" }}
          display={
            <div className={SCREEN}>
              <div className={BAR} data-page-bar>
                <span className={WHERE}>{props.where ?? props.status}</span>
                <a className={TO_MACHINE} href={`${root}/#cam=screen`}>
                  ‹ Machine
                </a>
              </div>
              <div
                className={props.sign === undefined ? VIEW : VIEW_UNDER_SIGN}
              >
                {props.children}
              </div>
              <div className={FOOT} aria-hidden="true">
                {props.caption ?? ""}
              </div>
            </div>
          }
        />
      </body>
    </html>
  );
}

export function renderMachinePage(props: MachinePageProps): string {
  return `<!doctype html>${renderToStaticMarkup(<MachinePage {...props} />)}`;
}
