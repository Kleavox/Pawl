import type { ReactNode } from "react";

import { code39Bars } from "./code39";

const QUIET = 10;
const WIDE = 3;

const END =
  "receipt__end grid justify-items-center gap-[14px] mt-[34px] pt-[22px] [border-top:2px_dashed_var(--pw-paper-rule)] text-center";

const KEEP =
  "receipt__keep m-0 font-pw-mono text-rem-small font-extrabold tracking-[0.2em]";

const FIGURE =
  "receipt__barcode grid justify-items-center gap-[6px] w-full m-0";

const BARS = "block w-[min(300px,100%)] h-[46px] fill-pw-paper-ink";

const LINE =
  "m-0 font-pw-mono text-rem-label font-bold tracking-[0.3em] text-pw-paper-dim";

function Barcode(props: { data: string }): ReactNode {
  let x = QUIET;
  const bars: { x: number; width: number }[] = [];
  for (const stripe of code39Bars(props.data)) {
    const width = stripe.wide ? WIDE : 1;
    if (stripe.bar) bars.push({ x, width });
    x += width;
  }
  const total = x + QUIET;
  return (
    <figure className={FIGURE} data-barcode={props.data}>
      <svg
        className={BARS}
        viewBox={`0 0 ${total} 40`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        {bars.map((bar) => (
          <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={40} />
        ))}
      </svg>
      <figcaption className={LINE}>*{props.data}*</figcaption>
    </figure>
  );
}

export function ReceiptEnd(props: {
  data: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <div className={END}>
      <p className={KEEP}>— KEEP THIS RECEIPT —</p>
      <Barcode data={props.data} />
      {props.children}
    </div>
  );
}
