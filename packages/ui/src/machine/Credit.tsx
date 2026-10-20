import type { ReactNode } from "react";

import { segmentsOf } from "./segments";

const CREDIT =
  "credit row-[1] col-[1] self-center justify-self-start inline-flex items-center gap-2 px-3 py-2 rounded-[--spacing(3)] bg-pw-black shadow-[inset_0_0_0_--spacing(1)_var(--pw-graphite),0_--spacing(1)_0_var(--pw-highlight)] pointer-events-none data-credit-blink:animate-[credit-blink_900ms_steps(1,end)_1_both] max-desk:row-[1] max-desk:col-[2] max-desk:justify-self-end max-desk:mr-6";

const DIGIT =
  "block w-8 h-13 [transform:skewX(-6deg)] [filter:drop-shadow(0_0_--spacing(1.5)_var(--pw-seg))]";

const ON = "fill-pw-seg";

const OFF = "fill-pw-seg-off";

const SEGMENTS: readonly (readonly [string, string])[] = [
  ["a", "2,0.5 8,0.5 7,1.7 3,1.7"],
  ["b", "8.5,1 8.5,7.5 7.3,6.9 7.3,2.2"],
  ["c", "8.5,8.5 8.5,15 7.3,13.8 7.3,9.1"],
  ["d", "3,14.3 7,14.3 8,15.5 2,15.5"],
  ["e", "1.5,8.5 2.7,9.1 2.7,13.8 1.5,15"],
  ["f", "1.5,1 2.7,2.2 2.7,6.9 1.5,7.5"],
  ["g", "2.4,8 3.2,7.4 6.8,7.4 7.6,8 6.8,8.6 3.2,8.6"],
];

export function Credit(props: { text: string; blink?: boolean }): ReactNode {
  return (
    <span
      className={CREDIT}
      data-part="credit"
      data-credit={props.text}
      data-credit-blink={props.blink ? "" : undefined}
      aria-hidden="true"
    >
      {segmentsOf(props.text).map((lit, place) => (
        <svg key={place} className={DIGIT} viewBox="0 0 10 16">
          {SEGMENTS.map(([name, points]) => (
            <polygon
              key={name}
              points={points}
              data-seg={name}
              data-on={lit.includes(name) ? "" : undefined}
              className={lit.includes(name) ? ON : OFF}
            />
          ))}
        </svg>
      ))}
    </span>
  );
}
