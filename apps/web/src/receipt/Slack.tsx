import type { ReactNode } from "react";

const LOOP =
  "M3,0 L97,0 C97.5,28 93.5,52 93,71 C92.6,84 99,95 100,100 L0,100 C1,95 7.4,84 7,71 C6.5,52 2.5,28 3,0 Z";

const SHADE: [offset: number, tone: "black" | "white", opacity: number][] = [
  [0, "black", 0.32],
  [0.07, "black", 0],
  [0.36, "black", 0.04],
  [0.58, "black", 0.3],
  [0.7, "black", 0.52],
  [0.8, "black", 0.2],
  [0.92, "black", 0],
  [0.95, "white", 0],
  [0.975, "white", 0.9],
  [1, "black", 0.18],
];

const SVG =
  "block size-full overflow-visible [filter:drop-shadow(calc(3*var(--k))_calc(5*var(--k))_calc(5*var(--k))_rgb(0_0_0/45%))]";

export function Slack(): ReactNode {
  return (
    <svg className={SVG} viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id="receipt-slack-shade" x1="0" y1="0" x2="0" y2="1">
          {SHADE.map(([offset, tone, opacity]) => (
            <stop
              key={offset}
              offset={offset}
              className={
                tone === "black"
                  ? "[stop-color:var(--pw-black)]"
                  : "[stop-color:var(--pw-white)]"
              }
              stopOpacity={opacity}
            />
          ))}
        </linearGradient>
        <pattern
          id="receipt-slack-lines"
          width="100"
          height="3.4"
          patternUnits="userSpaceOnUse"
        >
          <rect
            width="100"
            height="0.8"
            className="fill-pw-black"
            opacity="0.12"
          />
        </pattern>
        <clipPath id="receipt-slack-loop">
          <path d={LOOP} />
        </clipPath>
      </defs>
      <path d={LOOP} className="fill-pw-paper" />
      <path d={LOOP} fill="url(#receipt-slack-shade)" />
      <rect
        x="13"
        y="9"
        width="74"
        height="46"
        fill="url(#receipt-slack-lines)"
        clipPath="url(#receipt-slack-loop)"
      />
      <rect
        y="80"
        width="100"
        height="16"
        fill="url(#receipt-slack-lines)"
        clipPath="url(#receipt-slack-loop)"
        opacity="0.6"
      />
    </svg>
  );
}
