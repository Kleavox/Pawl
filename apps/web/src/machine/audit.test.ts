import { describe, expect, it } from "vitest";

import { auditLines, crc16arc, dexText } from "./audit";

const INPUT = {
  serial: "PAWL-GW-01",
  model: "GW-01",
  host: "example.test:8786",
  bays: [
    { code: "1", title: "Notes", vends: 0 },
    { code: "3", title: "Docs", vends: 2 },
  ],
  reads: 1,
};

describe("the DEX/UCS audit", () => {
  it("checks with CRC-16/ARC, whose check value for 123456789 is BB3D", () => {
    expect(crc16arc("123456789")).toBe(0xbb3d);
    expect(crc16arc("")).toBe(0);
  });

  it("writes the EVA-DTS segments in order, from DXS to DXE", () => {
    const lines = auditLines(INPUT);
    expect(lines.map((line) => line.split("*")[0])).toEqual([
      "DXS",
      "ST",
      "ID1",
      "VA1",
      "VA3",
      "PA1",
      "PA2",
      "PA1",
      "PA2",
      "EA3",
      "G85",
      "SE",
      "DXE",
    ]);
    expect(lines[0]).toBe("DXS*PAWL-GW-01*VA*V1/1*1");
    expect(lines[1]).toBe("ST*001*0001");
    expect(lines[2]).toBe("ID1*PAWL-GW-01*GW-01**EXAMPLE.TEST:8786**");
    expect(lines[3]).toBe("VA1*0*0*0*0");
    expect(lines[4]).toBe("VA3*0*2*0*2");
    expect(lines.slice(5, 9)).toEqual([
      "PA1*1*0*NOTES",
      "PA2*0*0*0*0",
      "PA1*3*0*DOCS",
      "PA2*2*0*2*0",
    ]);
    expect(lines[9]).toBe("EA3*1");
    expect(lines.at(-2)).toBe("SE*11*0001");
    expect(lines.at(-1)).toBe("DXE*1*1");
  });

  it("seals the set with the CRC of the lines from ST to the one before G85", () => {
    const lines = auditLines(INPUT);
    const sealed = lines.slice(1, 10).join("\r\n");
    const value = crc16arc(sealed).toString(16).toUpperCase().padStart(4, "0");
    expect(lines[10]).toBe(`G85*${value}`);
    expect(lines[10]).toMatch(/^G85\*[0-9A-F]{4}$/);
  });

  it("keeps a title from breaking a segment", () => {
    expect(dexText("a*b~c")).toBe("A B C");
    expect(dexText("two\nlines")).toBe("TWO LINES");
    expect(dexText("Café ☕")).toBe("CAFE ?");
    expect(dexText("e\u0301")).toBe("E");
    expect(dexText("x".repeat(40))).toHaveLength(30);
    const lines = auditLines({
      ...INPUT,
      bays: [{ code: "1", title: "Star*Tilde~Line\nBreak", vends: 0 }],
    });
    expect(lines[5]).toBe("PA1*1*0*STAR TILDE LINE BREAK");
  });
});
