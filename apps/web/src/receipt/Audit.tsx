import type { ReactNode } from "react";

import { ReceiptEnd } from "./Barcode";
import { BODY, FACTS, HEAD, PRINTED_AT, SERIAL_LINE } from "./Delivery";

export type AuditFacts = {
  serial: string;
  model: string;
  host: string;
  printed: Date;
  lines: string[];
};

const DEX =
  "m-0 p-[10px] rounded-[3px] bg-[rgb(0_0_0/5%)] font-pw-mono text-rem-small leading-[1.5] whitespace-pre-wrap break-all";

const LEGEND =
  "grid grid-cols-[auto_minmax(0,1fr)] gap-x-[12px] gap-y-[2px] m-0 font-pw-mono text-rem-label [&_dt]:font-bold [&_dt]:tracking-[0.1em] [&_dd]:m-0 [&_dd]:text-pw-paper-dim";

const SEGMENTS: readonly [string, string][] = [
  ["DXS", "Header: who sends, DEX/UCS version"],
  ["ST", "This set begins"],
  ["ID1", "The machine: serial, model, build, location"],
  ["VA1", "Paid vends: none, this machine takes no money"],
  ["VA3", "Free vends since this page opened"],
  ["PA1", "A bay: its code, price and product"],
  ["PA2", "That bay's vends since this page opened"],
  ["EA3", "Audits read since this page opened"],
  ["G85", "CRC-16 of the set, a check against a bad read"],
  ["SE", "This set ends, with its count of lines"],
  ["DXE", "Trailer"],
];

export function Audit(props: { facts: AuditFacts }): ReactNode {
  const { facts } = props;
  const check = facts.lines.find((line) => line.startsWith("G85*"));
  const rows: [string, string][] = [
    ["Model", facts.model],
    ["Serial", facts.serial],
    ["Location", facts.host],
    ["Printed", PRINTED_AT.format(facts.printed)],
  ];
  return (
    <>
      <div className={HEAD}>
        <p className={SERIAL_LINE}>{facts.serial} · DEX/UCS</p>
        <h1 id="delivery-title">Machine audit</h1>
        <dl className={FACTS}>
          {rows.map(([term, value]) => (
            <div key={term} className="contents">
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <section className={BODY} aria-labelledby="delivery-title">
        <pre className={DEX} data-dex>
          {facts.lines.join("\n")}
        </pre>
        <dl className={LEGEND}>
          {SEGMENTS.map(([segment, meaning]) => (
            <div key={segment} className="contents" data-segment={segment}>
              <dt>{segment}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
      <ReceiptEnd data={`G85-${check?.slice(4) ?? "--"}`} />
    </>
  );
}
