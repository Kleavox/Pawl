import { describe, expect, it } from "vitest";
import { MACHINE_PARTS } from "@pawl/core";
import type { BayView } from "@pawl/registry";

import { renderCabinet, renderReceiptMachine } from "./cabinet";

const BAYS: BayView[] = [
  {
    code: "2",
    key: "notes",
    estate: true,
    product: "NOTE",
    chars: 4,
    title: "Notes",
    access: "visitor",
    shape: "tall",
    href: "https://notes.example.test",
  },
];

function cabinet(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = renderCabinet({
    siteName: "Fixture",
    rootOrigin: "https://example.test",
    passHref: "https://paw.example.test",
    bays: BAYS,
    ticker: "WELCOME TO FIXTURE",
  });
  return root;
}

describe("renderCabinet", () => {
  it("draws the shared machine with every part, framed whole", () => {
    const root = cabinet();
    for (const part of MACHINE_PARTS) {
      expect(root.querySelectorAll(`[data-part="${part}"]`)).toHaveLength(1);
    }
    expect(
      root.querySelector<HTMLElement>("[data-camera]")!.dataset.framing,
    ).toBe("whole");
  });

  it("starts the machine as a guest looking at the products", () => {
    const machine = cabinet().querySelector<HTMLElement>("[data-machine]")!;
    expect({ ...machine.dataset }).toMatchObject({
      access: "guest",
      status: "idle",
      input: "selector",
      view: "products",
    });
  });

  it("puts the screens and the nine tiles on the display", () => {
    const display = cabinet().querySelector("[data-part='display']")!;
    expect(display.querySelectorAll("[data-view-panel]")).toHaveLength(6);
    expect(display.querySelectorAll("[data-tile]")).toHaveLength(9);
  });

  it("gives the delivery bay its falling cartridge, its result and TAKE DELIVERY", () => {
    const tray = cabinet().querySelector("[data-part='tray']")!;
    expect(tray.querySelector("[data-falling]")).not.toBeNull();
    expect(tray.querySelector("[data-tray]")).not.toBeNull();
    expect(tray.querySelector("[data-tray-action]")!.textContent).toBe(
      "TAKE DELIVERY",
    );
  });

  it("wires the twelve keys, the brand as the page heading, and the sound switch", () => {
    const root = cabinet();
    expect(root.querySelectorAll("button[data-key]")).toHaveLength(12);
    expect(root.querySelector("h1")!.textContent).toBe("FIXTURE");
    expect(root.querySelector("[data-sound]")).not.toBeNull();
  });

  it("links the receipts on its own host, so a visit never changes host", () => {
    expect(
      [...cabinet().querySelectorAll<HTMLAnchorElement>(".plate a")].map(
        (link) => link.getAttribute("href"),
      ),
    ).toEqual(["/privacy.html", "/terms.html"]);
  });

  it("speaks first on the status LCD", () => {
    const root = cabinet();
    expect(root.querySelector("[data-screen]")!.textContent).toBe("PICK A BAY");
    expect(root.querySelector("[data-screen-sub]")!.textContent).toBe(
      "OR SIGN IN ON SCREEN",
    );
  });

  it("draws the same machine for a receipt, framed on the printer, its LCD naming the receipt", () => {
    const root = document.createElement("div");
    root.innerHTML = renderReceiptMachine({
      siteName: "Fixture",
      rootOrigin: "https://example.test",
      title: "Privacy policy",
    });
    for (const part of MACHINE_PARTS) {
      expect(root.querySelectorAll(`[data-part="${part}"]`)).toHaveLength(1);
    }
    expect(
      root.querySelector<HTMLElement>("[data-camera]")!.dataset.framing,
    ).toBe("printer");
    expect(root.querySelector("[data-screen]")!.textContent).toBe(
      "RECEIPT PRINTED",
    );
    expect(root.querySelector("[data-screen-sub]")!.textContent).toBe(
      "PRIVACY POLICY",
    );
    expect(root.querySelector("h1")).toBeNull();
    expect(root.querySelector("main")).toBeNull();
    expect(root.querySelector(".room")!.getAttribute("role")).toBe("region");
    expect(root.querySelectorAll(".keypad a, .keypad button")).toHaveLength(0);
    expect(
      [...root.querySelectorAll<HTMLAnchorElement>(".plate a")].map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual(["/privacy.html", "/terms.html"]);
  });

  it("reads a #cam= hint on the cabinet, where an arrival pulls back to the whole machine, and never on a receipt, which only shows the printer", () => {
    expect(cabinet().querySelector("[data-camera] > script")).not.toBeNull();
    const receipt = document.createElement("div");
    receipt.innerHTML = renderReceiptMachine({
      siteName: "Fixture",
      rootOrigin: "https://example.test",
      title: "Privacy policy",
    });
    expect(receipt.querySelector("script")).toBeNull();
  });

  it("carries no pass card, no reader and no card words", () => {
    const root = cabinet();
    expect(root.querySelector(".pawl-card, [data-reader]")).toBeNull();
    expect(root.querySelector("header, footer")).toBeNull();
    expect(root.innerHTML).not.toMatch(/INSERT PASS|EJECT PASS/i);
  });
});
