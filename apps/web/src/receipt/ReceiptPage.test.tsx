import type { PublicView } from "@pawl/registry";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CATALOG } from "../machine/catalog.testkit";
import { ReceiptPage } from "./ReceiptPage";

const SITE: PublicView = {
  site: { name: "Fixture" },
  tools: [],
  bays: CATALOG,
  footer: [],
};

const HOSTS = { rootHost: "example.test", passHost: "paw.example.test" };

function text(kind: "privacy" | "terms"): string {
  return renderToStaticMarkup(
    <ReceiptPage site={SITE} kind={kind} hosts={HOSTS} />,
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("ReceiptPage", () => {
  it.each(["privacy", "terms"] as const)(
    "hangs the %s receipt from the machine's printer, with no header or footer",
    (kind) => {
      const { container } = render(
        <ReceiptPage site={SITE} kind={kind} hosts={HOSTS} />,
      );
      const machine = screen.getByRole("region", {
        name: "Fixture vending machine",
      });
      expect(machine.querySelector("[data-camera]")).toHaveAttribute(
        "data-framing",
        "printer",
      );
      expect(machine.querySelector("script")).toBeNull();
      const main = screen.getByRole("main");
      expect(main).toHaveClass("receipt-feed");
      expect(main).toHaveAttribute("aria-labelledby", "receipt-title");
      expect(main.querySelector("article[data-receipt]")).not.toBeNull();
      const tears = [
        ...main.querySelectorAll<HTMLAnchorElement>("a[data-tear]"),
      ];
      expect(tears.map((link) => link.getAttribute("href"))).toEqual([
        "/",
        "/",
      ]);
      expect(
        main.querySelector(".receipt__head a.receipt__tear-top[data-tear]"),
      ).not.toBeNull();
      expect(container.querySelector("header, footer")).toBeNull();
      expect(main).toHaveTextContent("12 October 2026");
      expect(
        main.querySelector("a[href='mailto:privacy@example.test']"),
      ).not.toBeNull();
    },
  );

  it("keeps the room in place and gives the paper its own scroll frame", () => {
    const { container } = render(
      <ReceiptPage site={SITE} kind="privacy" hosts={HOSTS} />,
    );
    expect(container.querySelector(".room")).toHaveClass("fixed");
    const frame = container.querySelector("[data-receipt-frame]")!;
    expect(frame).toHaveClass("overflow-y-auto");
    expect(frame).toHaveAttribute("tabindex", "0");
    expect(frame.className).not.toMatch(
      /scrollbar-width:none|scrollbar\]:hidden/,
    );
    expect(frame.className).toContain("[scrollbar-width:thin]");
    expect(
      screen
        .getByRole("main")
        .contains(
          screen.getByRole("heading", { level: 1, name: "Privacy policy" }),
        ),
    ).toBe(true);
  });

  it("tears on the frame with transform and opacity only, never on the whole paper", () => {
    const { container } = render(
      <ReceiptPage site={SITE} kind="privacy" hosts={HOSTS} />,
    );
    const frame = container.querySelector("[data-receipt-frame]")!;
    expect(frame.className).toMatch(
      /data-\[torn=fall\]:animate-\[receipt-fall_380ms/,
    );
    expect(frame.className).toMatch(
      /data-\[torn=rip\]:animate-\[receipt-rip_120ms/,
    );
    expect(frame.className).toMatch(/data-\[torn\]:will-change-transform/);
    expect(container.querySelector("[data-receipt]")!.className).not.toMatch(
      /data-\[torn/,
    );
  });

  it("rests on the printer from its first frame when visited directly, without a glide", () => {
    window.history.replaceState(null, "", "/privacy.html");
    const { container } = render(
      <ReceiptPage site={SITE} kind="terms" hosts={HOSTS} />,
    );
    const camera = container.querySelector<HTMLElement>("[data-camera]")!;
    expect(camera.dataset.framing).toBe("printer");
    expect(camera.dataset.moving).toBeUndefined();
  });

  it("names the receipt on the printer's LCD", () => {
    const { container } = render(
      <ReceiptPage site={SITE} kind="terms" hosts={HOSTS} />,
    );
    expect(container.querySelector("[data-screen]")).toHaveTextContent(
      "RECEIPT PRINTED",
    );
    expect(container.querySelector("[data-screen-sub]")).toHaveTextContent(
      "TERMS OF SERVICE",
    );
  });
});

describe("the privacy policy says what the code does", () => {
  const privacy = text("privacy");

  it.each([
    "openid email profile",
    "read:user user:email",
    "__Secure-pawl_session",
    "__Secure-pawl_verified",
    "__Secure-pawl_oauth",
    "__Host-session",
    "__Host-signin",
    "__Host-silent",
    "pawl:sound",
    "7 days",
    "10 minutes",
    "30 minutes",
    "15 minutes",
    "60 seconds",
    "30 days",
    "salted hash",
    "Cloudflare",
    "Turnstile",
    "Resend",
    "Delete this account",
    "never reaches",
    "not sold",
    "13",
    "IP address it was created from",
  ])("mentions %s", (fact) => {
    expect(privacy).toContain(fact);
  });

  it.each([
    ["the raw IP is never kept", "never store the IP address"],
    ["sessions record when they were last used", "last used"],
    ["the cabinet caches counts in pawl:overview", "pawl:overview"],
    ["HTTPS is end to end", "end to end"],
  ])("does not claim %s", (_claim, words) => {
    expect(privacy).not.toContain(words);
  });
});

describe("the terms cover what an account holder agrees to", () => {
  const terms = text("terms");

  it.each([
    "Acceptable use",
    "Apps you connect",
    "Google or GitHub",
    "as is",
    "Limitation of liability",
    "Ending your account",
    "Changes to these terms",
    "cannot recover",
  ])("covers %s", (clause) => {
    expect(terms).toContain(clause);
  });
});
