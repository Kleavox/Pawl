const LONGEST = 30;

export function crc16arc(text: string): number {
  let crc = 0;
  for (let at = 0; at < text.length; at += 1) {
    crc ^= text.charCodeAt(at) & 0xff;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc;
}

export function dexText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[*~\r\n]/gu, " ")
    .replace(/[^\x20-\x7e]/gu, "?")
    .toUpperCase()
    .slice(0, LONGEST);
}

export type AuditInput = {
  serial: string;
  model: string;
  host: string;
  bays: { code: string; title: string; vends: number }[];
  reads: number;
};

export function auditLines(input: AuditInput): string[] {
  const free = input.bays.reduce((sum, bay) => sum + bay.vends, 0);
  const set = [
    "ST*001*0001",
    `ID1*${dexText(input.serial)}*${dexText(input.model)}**${dexText(input.host)}**`,
    "VA1*0*0*0*0",
    `VA3*0*${free}*0*${free}`,
    ...input.bays.flatMap((bay) => [
      `PA1*${dexText(bay.code)}*0*${dexText(bay.title)}`,
      `PA2*${bay.vends}*0*${bay.vends}*0`,
    ]),
    `EA3*${input.reads}`,
  ];
  const check = crc16arc(set.join("\r\n"))
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
  return [
    `DXS*${dexText(input.serial)}*VA*V1/1*1`,
    ...set,
    `G85*${check}`,
    `SE*${set.length + 2}*0001`,
    "DXE*1*1",
  ];
}
