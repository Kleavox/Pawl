import { MACHINE_PARTS } from "@pawl/ui";
import { CAMERA_HINT_HASH, CAMERA_HINT_SCRIPT } from "@pawl/ui/camera-hint";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import headers from "../public/_headers?raw";

import { initialMode } from "./flow";
import { renderShell } from "./prerender";
import { renderPass } from "./test-kit";
import { SCREEN_FORM } from "./views/context";

const shell = renderShell({
  siteName: "Fixture",
  rootOrigin: "https://example.test",
});

describe("paw.'s prerendered page", () => {
  it("is the shared machine with every part once, and no pass card", () => {
    for (const part of MACHINE_PARTS) {
      expect(
        shell.match(new RegExp(`data-part="${part}"`, "g")),
        part,
      ).toHaveLength(1);
    }
    expect(shell).not.toMatch(
      /pawl-card|data-reader|pocket|INSERT PASS|EJECT PASS|<header|<footer/,
    );
  });

  it("prerenders one shell that waits for the session, with nothing dynamic in it", () => {
    expect(shell).toContain("ONE MOMENT");
    expect(shell).not.toMatch(/GMT|\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it("opens whole, so a direct visit can dolly in, and reads a #cam= hint first", () => {
    expect(shell).toContain('data-framing="whole"');
    expect(shell).toContain(`<script>${CAMERA_HINT_SCRIPT}</script>`);
  });

  it("lets the camera hint run under paw.'s content security policy", () => {
    const policy = headers
      .split("\n")
      .find((line) => line.includes("Content-Security-Policy: "))!;
    const scripts = /script-src ([^;]*)/.exec(policy)![1]!.split(" ");
    expect(scripts).toContain("'self'");
    expect(scripts).toContain(CAMERA_HINT_HASH);
    expect(scripts).not.toContain("'unsafe-inline'");
  });

  it("gives the views a place on the display and a way back to the machine", () => {
    expect(shell).toMatch(/data-part="display"[\s\S]*id="screen"/);
    expect(shell).toMatch(
      /href="https:\/\/example.test\/"[^>]*data-to-machine/,
    );
  });

  it("keeps the plate's links out of the keyboard's way, since paw. never shows the plate", () => {
    expect(shell).toMatch(/data-part="plate"[^>]*inert=""/);
  });

  it("makes GO submit the screen's form and CLR a plain button", () => {
    expect(shell).toMatch(
      new RegExp(`<button[^>]*type="submit"[^>]*form="${SCREEN_FORM}"`),
    );
    expect(shell).toMatch(/<button[^>]*type="button"[^>]*data-key="CLR"/);
  });
});

describe("paw.'s keypad", () => {
  it("lights the digits on the code step", () => {
    renderPass({ view: "code" });
    expect(screen.getByRole("button", { name: /^5/ })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("paw.'s LCD", () => {
  it("names every view in words that fit its one status line", () => {
    const user = {
      id: "u1",
      email: "ana@b.test",
      username: "ana_01",
      role: "USER" as const,
    };
    for (const view of [
      "methods",
      "email",
      "password",
      "register",
      "register-key",
      "sent",
      "forgot",
      "welcome",
      "welcome-key",
      "verify",
      "reset",
      "link",
      "challenge",
      "account",
      "profile",
      "profile-name",
      "profile-key",
      "devices",
      "apps",
      "security",
      "delete",
    ] as const) {
      const { container, unmount } = renderPass({ view }, { user });
      const words = container.querySelector("[data-screen]")!.textContent!;
      expect(words.length, `${view}: ${words}`).toBeLessThanOrEqual(17);
      unmount();
    }
  });
});

describe("initialMode", () => {
  it("opens the register view when the cabinet asked for it", () => {
    expect(initialMode("?mode=register&returnTo=x")).toBe("register");
    expect(initialMode("?mode=forgot")).toBe("forgot");
    expect(initialMode("")).toBe("login");
    expect(initialMode("?mode=anything")).toBe("login");
  });
});
