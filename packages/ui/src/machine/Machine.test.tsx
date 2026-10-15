import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CAMERA_HINT_HASH, CAMERA_HINT_SCRIPT } from "./camera-hint";
import { Machine, type MachineProps } from "./Machine";
import { MACHINE_PARTS } from "./parts";

const BASE: MachineProps = {
  siteName: "Pawl",
  rootOrigin: "https://example.com",
  framing: "whole",
  ticker: "WELCOME",
  chip: { state: "guest", word: "GUEST MODE" },
  display: <p>screen</p>,
  lcd: { main: "PICK A BAY", sub: "OR SIGN IN" },
  keypad: { mode: "machine", lit: new Set() },
};

function drawn(props: Partial<MachineProps> = {}): HTMLElement {
  return render(<Machine {...BASE} {...props} />).container;
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("Machine", () => {
  it("draws every part once, inside the camera, with no page chrome and no pass card", () => {
    const root = drawn();
    for (const part of MACHINE_PARTS) {
      expect(root.querySelectorAll(`[data-part="${part}"]`), part).toHaveLength(
        1,
      );
    }
    const camera = root.querySelector(".room > .camera[data-camera]")!;
    expect(camera).toHaveAttribute("data-framing", "whole");
    expect(camera.querySelector("[data-machine]")).not.toBeNull();
    expect(root.innerHTML).not.toMatch(
      /<header\b|<footer\b|pawl-card|data-reader|INSERT PASS|EJECT PASS/,
    );
  });

  it("glides the camera on transform, which the compositor runs, and promotes it only while it moves", () => {
    const camera = drawn().querySelector("[data-camera]")!;
    expect(camera.className).toContain("transition-[transform]");
    expect(camera.className).not.toMatch(/transition-\[--cam/);
    expect(camera.className).toContain("data-moving:will-change-transform");
  });

  it("runs the hint script before the camera exists, so no frame can paint the camera unhinted", () => {
    const html = renderToStaticMarkup(<Machine {...BASE} />);
    expect(html).toMatch(
      new RegExp(
        `<script>${escaped(CAMERA_HINT_SCRIPT)}</script><div class="camera[^"]*"`,
      ),
    );
    expect(renderToStaticMarkup(<Machine {...BASE} settled />)).not.toContain(
      "<script",
    );
  });

  it("keeps the hint's hash in step with its text, and its text safe inside a script element", async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(CAMERA_HINT_SCRIPT),
    );
    expect(CAMERA_HINT_HASH).toBe(
      `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`,
    );
    expect(CAMERA_HINT_SCRIPT).not.toMatch(/<\/script|<!--/i);
  });

  it("marks the page with exactly the two hints the camera script reads", () => {
    const framed = (hash: string): string | undefined => {
      const page = { dataset: {} as Record<string, string> };
      new Function("location", "document", CAMERA_HINT_SCRIPT)(
        { hash },
        { documentElement: page },
      );
      return page.dataset.camHint;
    };
    expect(framed("#cam=screen")).toBe("screen");
    expect(framed("#cam=printer")).toBe("printer");
    expect(framed("#cam%3Dprinter")).toBe("printer");
    for (const hash of [
      "",
      "#cam=whole",
      "#cam=SCREEN",
      "#toString",
      "#cam=%E0%A4%A",
    ]) {
      expect(framed(hash), hash).toBeUndefined();
    }
  });

  it("is the page's main landmark unless the page says its content lives elsewhere", () => {
    expect(drawn().querySelector("main.room")).toHaveAccessibleName(
      "Pawl vending machine",
    );
    const aside = drawn({ main: false });
    expect(aside.querySelector("main")).toBeNull();
    expect(aside.querySelector(".room")).toHaveAttribute("role", "region");
  });

  it("keeps the plate out of the keyboard's way when the camera frames only the screen", () => {
    expect(
      drawn({ framing: "screen" }).querySelector(".plate"),
    ).toHaveAttribute("inert");
    expect(drawn().querySelector(".plate")).not.toHaveAttribute("inert");
  });

  it("speaks the status from the LCD's live region", () => {
    const line = drawn().querySelector("[data-part='lcd'] [role='status']")!;
    expect(line.querySelector("[data-screen]")).toHaveTextContent("PICK A BAY");
    expect(line.querySelector("[data-screen-sub]")).toHaveTextContent(
      "OR SIGN IN",
    );
  });

  it("gives the machine keypad twelve keys with their braille cells and both lamps", () => {
    const root = drawn();
    expect(root.querySelectorAll("[data-key]")).toHaveLength(12);
    expect(root.querySelectorAll(".pw-braille")).toHaveLength(10);
    expect(root.querySelector('[data-keypad-mode="selector"]')).not.toBeNull();
    expect(root.querySelector('[data-keypad-mode="otp"]')).not.toBeNull();
  });

  it("gives a service keypad unlit digits and only the keys the page offers", () => {
    const root = drawn({
      framing: "screen",
      keypad: {
        mode: "service",
        lit: new Set(["CLR", "GO"]),
        clr: {
          kind: "submit",
          form: "consent",
          name: "decision",
          value: "deny",
        },
        go: { kind: "link", href: "/#cam=screen" },
        caption: "CLR DENY · GO ALLOW",
      },
    });
    expect(
      root.querySelectorAll(".pw-key.is-unlit[aria-hidden='true']"),
    ).toHaveLength(10);
    const clr = root.querySelector("button[form='consent']")!;
    expect(clr).toHaveAttribute("type", "submit");
    expect(clr).toHaveAttribute("name", "decision");
    expect(clr).toHaveAttribute("value", "deny");
    expect(clr).toHaveAttribute("aria-describedby", "keys-caption");
    expect(root.querySelector("a[href='/#cam=screen']")).toHaveAttribute(
      "aria-describedby",
      "keys-caption",
    );
    expect(
      root.querySelector("p#keys-caption.keypad__caption"),
    ).toHaveTextContent("CLR DENY · GO ALLOW");
    expect(root.textContent).not.toContain("Service");
  });

  it("leaves a service key unlit when the page has nothing for it", () => {
    const root = drawn({ keypad: { mode: "service", lit: new Set() } });
    expect(
      root.querySelectorAll(".pw-key.is-unlit[aria-hidden='true']"),
    ).toHaveLength(12);
  });

  it("names the site on the marquee and links the receipts on the plate", () => {
    const root = drawn({
      headingBrand: true,
      sound: <button type="button" data-sound aria-pressed="false" />,
    });
    expect(root.querySelector("h1.marquee__brand")).toHaveTextContent("PAWL");
    expect(
      root.querySelector("a[href='https://example.com/privacy.html']"),
    ).not.toBeNull();
    expect(
      root.querySelector("a[href='https://example.com/terms.html']"),
    ).not.toBeNull();
    expect(root.querySelector(".plate [data-sound]")).not.toBeNull();
    const plain = drawn();
    expect(plain.querySelector("[data-sound]")).toBeNull();
    expect(plain.querySelector("p.marquee__brand")).toHaveTextContent("PAWL");
  });

  it("escapes what it is given", () => {
    const html = renderToStaticMarkup(
      <Machine
        {...BASE}
        siteName="<b>x</b>"
        ticker="<i>t</i>"
        lcd={{ main: "<s>", sub: "&" }}
        chip={{ state: "guest", word: "<u>" }}
        display={<em>ok</em>}
      />,
    );
    expect(html).not.toMatch(/<b>x<\/b>|<i>t<\/i>|<s>|<u>/);
    expect(html).toContain("<em>ok</em>");
  });

  it("hangs a sign over the screen when there is one", () => {
    expect(
      drawn({ sign: "OUT OF ORDER" }).querySelector(".bezel__sign"),
    ).toHaveTextContent("OUT OF ORDER");
  });

  it("carries the attributes a page sets on the machine", () => {
    const machine = drawn({
      machine: { "data-access": "guest", "data-view": 'x"y' },
    }).querySelector("[data-machine]")!;
    expect(machine).toHaveAttribute("data-access", "guest");
    expect(machine).toHaveAttribute("data-view", 'x"y');
  });

  it("puts what a page gives the delivery bay inside it", () => {
    const root = drawn({
      tray: (
        <button type="button" data-tray-action>
          TAKE
        </button>
      ),
    });
    expect(
      root.querySelector("[data-part='tray'] [data-tray-action]"),
    ).not.toBeNull();
  });
});
