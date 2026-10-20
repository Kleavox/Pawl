import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CAMERA_HINT_HASH, CAMERA_HINT_SCRIPT } from "./camera-hint";
import { Credit } from "./Credit";
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

  it("reads FrEE on its credit display unless told otherwise, as a free-vend machine does", () => {
    const root = drawn();
    const credit = root.querySelector("[data-part='credit']")!;
    expect(credit).toHaveAttribute("data-credit", "FrEE");
    expect(credit).toHaveAttribute("aria-hidden", "true");
    expect(credit.closest("[aria-label='Service panel']")).not.toBeNull();
    expect(credit.querySelectorAll("svg")).toHaveLength(4);
    expect(credit.querySelectorAll("[data-seg][data-on]")).toHaveLength(
      4 + 2 + 5 + 5,
    );
    const shown = drawn({ credit: <Credit text="1234" /> });
    expect(shown.querySelector("[data-part='credit']")).toHaveAttribute(
      "data-credit",
      "1234",
    );
  });

  it("hangs the display's door on two hinges opposite its lock, and warns on the bay not to rock it", () => {
    const root = drawn();
    const hinges = root.querySelectorAll("[data-part='bezel'] > [data-hinge]");
    expect(hinges).toHaveLength(2);
    for (const hinge of hinges) {
      expect(hinge).toHaveAttribute("aria-hidden", "true");
      expect(hinge.className).toContain("max-desk:hidden");
    }
    const sticker = root.querySelector(
      "[data-part='tray'] > [data-sticker='tilt']",
    )!;
    expect(sticker).toHaveTextContent("NEVER ROCK OR TILT");
    expect(sticker).toHaveAttribute("aria-hidden", "true");
    expect(sticker.className).toContain("max-desk:hidden");
  });

  it("lights every lamp for the lamp test, and restarts the marquee's tube once", () => {
    const tested = drawn({ machine: { "data-lamp-test": "" } });
    for (const which of ["ready", "busy", "denied"]) {
      expect(
        tested.querySelector(`.led--${which}`)!.className,
        which,
      ).toContain(
        "shadow-[0_0_0_--spacing(2)_var(--pw-steel-hi),0_0_0_--spacing(3)_var(--pw-steel-lo),0_0_--spacing(10)",
      );
    }
    const tube = tested.querySelector("[data-part='marquee'] > [data-tube]")!;
    expect(tube).toHaveAttribute("aria-hidden", "true");
    expect(tube.className).toContain(
      "group-data-[lamp-test]/machine:animate-[tube-start",
    );
    expect(drawn().querySelector(".led--denied")!.className).not.toContain(
      ",0_0_--spacing(10)_var(--pw-danger)]",
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

  it("gives a service keypad digit plates and only the keys the page offers", () => {
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
      root.querySelectorAll(".pw-key.is-plate[aria-hidden='true']"),
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

  it("draws a service key as a plate when the page has nothing for it", () => {
    const root = drawn({ keypad: { mode: "service", lit: new Set() } });
    expect(
      root.querySelectorAll(".pw-key.is-plate[aria-hidden='true']"),
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
