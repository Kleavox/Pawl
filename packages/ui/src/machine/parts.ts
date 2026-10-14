export type Framing = "whole" | "screen" | "printer";

export const MACHINE_PARTS = [
  "marquee",
  "ticker",
  "chip",
  "bezel",
  "display",
  "lock",
  "speaker",
  "sensor",
  "lcd",
  "placard",
  "keypad",
  "lenses",
  "printer",
  "printer-slot",
  "tray",
  "plate",
] as const;

export const SERIAL = "PAWL-GW-01";

export const DIGIT_ROWS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
] as const;

const DOT = "before:text-pw-steel-lo";

export const BRAILLE: Readonly<
  Record<string, { cells: string; dots: string }>
> = {
  "1": {
    cells: "1",
    dots: `${DOT} before:shadow-[--spacing(10)_--spacing(10)_0_currentcolor]`,
  },
  "2": {
    cells: "12",
    dots: `${DOT} before:shadow-[--spacing(10)_--spacing(10)_0_currentcolor,--spacing(10)_--spacing(15)_0_currentcolor]`,
  },
  "3": {
    cells: "14",
    dots: `${DOT} before:shadow-[--spacing(10)_--spacing(10)_0_currentcolor,--spacing(15)_--spacing(10)_0_currentcolor]`,
  },
  "4": {
    cells: "145",
    dots: `${DOT} before:shadow-[--spacing(10)_--spacing(10)_0_currentcolor,--spacing(15)_--spacing(10)_0_currentcolor,--spacing(15)_--spacing(15)_0_currentcolor]`,
  },
  "5": {
    cells: "15",
    dots: `${DOT} before:shadow-[--spacing(10)_--spacing(10)_0_currentcolor,--spacing(15)_--spacing(15)_0_currentcolor]`,
  },
  "6": {
    cells: "124",
    dots: `${DOT} before:shadow-[--spacing(10)_--spacing(10)_0_currentcolor,--spacing(10)_--spacing(15)_0_currentcolor,--spacing(15)_--spacing(10)_0_currentcolor]`,
  },
  "7": {
    cells: "1245",
    dots: `${DOT} before:shadow-[--spacing(10)_--spacing(10)_0_currentcolor,--spacing(10)_--spacing(15)_0_currentcolor,--spacing(15)_--spacing(10)_0_currentcolor,--spacing(15)_--spacing(15)_0_currentcolor]`,
  },
  "8": {
    cells: "125",
    dots: `${DOT} before:shadow-[--spacing(10)_--spacing(10)_0_currentcolor,--spacing(10)_--spacing(15)_0_currentcolor,--spacing(15)_--spacing(15)_0_currentcolor]`,
  },
  "9": {
    cells: "24",
    dots: `${DOT} before:shadow-[--spacing(10)_--spacing(15)_0_currentcolor,--spacing(15)_--spacing(10)_0_currentcolor]`,
  },
  "0": {
    cells: "245",
    dots: `${DOT} before:shadow-[--spacing(10)_--spacing(15)_0_currentcolor,--spacing(15)_--spacing(10)_0_currentcolor,--spacing(15)_--spacing(15)_0_currentcolor]`,
  },
};
