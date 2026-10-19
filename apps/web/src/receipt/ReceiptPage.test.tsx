import type { PublicView } from "@pawl/registry";
import { act, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  vi.useRealTimers();
});

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
      expect(main).toHaveTextContent("19 October 2026");
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
    expect(frame.className).toContain("[scrollbar-width:none]");
    expect(frame.className).not.toContain("scrollbar-width:thin");
    expect(
      screen
        .getByRole("main")
        .contains(
          screen.getByRole("heading", { level: 1, name: "Privacy policy" }),
        ),
    ).toBe(true);
  });

  it("hangs the paper from the slot line down, in front of the machine", () => {
    const { container } = render(
      <ReceiptPage site={SITE} kind="privacy" hosts={HOSTS} />,
    );
    const feed = container.querySelector("main")!;
    expect(feed.className).not.toContain("--slot-line:");
    expect(feed.className).toContain("top-(--slot-line)");
    expect(feed.className).not.toContain("inset-y-0");
    expect(
      container.querySelector("[data-receipt-frame]")!.className,
    ).not.toContain("pt-(--slot-line)");
    expect(container.querySelector("[data-receipt-shadow]")).not.toBeNull();
  });

  it("hangs what has been read as slack between the slot and the held edge, deeper the further one reads", async () => {
    const { container } = render(
      <ReceiptPage site={SITE} kind="privacy" hosts={HOSTS} />,
    );
    const feed = container.querySelector<HTMLElement>("main")!;
    const frame = container.querySelector<HTMLElement>("[data-receipt-frame]")!;
    const slack = container.querySelector<HTMLElement>("[data-receipt-slack]")!;
    expect(slack).toHaveAttribute("aria-hidden", "true");
    expect(slack.style.transform).toBe("scaleY(0)");
    expect(feed.contains(slack)).toBe(false);
    Object.defineProperty(frame, "scrollHeight", { value: 1100 });
    Object.defineProperty(frame, "clientHeight", { value: 100 });
    Object.defineProperty(slack, "offsetHeight", { value: 200 });
    frame.scrollTop = 250;
    await act(async () => {
      frame.dispatchEvent(new Event("scroll"));
    });
    expect(slack.style.transform).toBe("scaleY(0.5)");
    expect(feed.style.transform).toBe("translateY(100px)");
    expect(frame.className).toContain("pb-(--sag-max)");
    expect(frame.className).toContain("scroll-pb-(--sag-max)");
  });

  it("feeds out of the slot, which the frame's own edge clips, then settles once", () => {
    const { container } = render(
      <ReceiptPage site={SITE} kind="privacy" hosts={HOSTS} />,
    );
    const feed = container.querySelector("main")!;
    expect(feed).not.toHaveAttribute("data-feeding");
    expect(feed.className).not.toContain("clip-path");
    expect(container.querySelector("[data-receipt-hang]")!.className).toMatch(
      /animate-\[receipt-settle_900ms_ease-out_1_both\]/,
    );
  });

  it("tears with an uneven serrated edge, and its end carries one too", () => {
    const { container } = render(
      <ReceiptPage site={SITE} kind="privacy" hosts={HOSTS} />,
    );
    const paper = container.querySelector("[data-receipt]")!.className;
    expect(paper).toContain("receipt-edge");
    expect(paper).toContain("[[data-torn=rip]_&]:receipt-torn");
    expect(paper).toContain("[[data-torn=fall]_&]:receipt-torn");
    expect(paper).not.toContain("[[data-torn]_&]:receipt-torn");
  });

  it("never feeds or settles again when a torn receipt is put back", () => {
    const { container } = render(
      <ReceiptPage site={SITE} kind="privacy" hosts={HOSTS} />,
    );
    for (const node of [
      container.querySelector("[data-receipt]")!,
      container.querySelector("[data-receipt-hang]")!,
    ]) {
      expect(node.className).not.toContain("[[data-torn]_&]:animate-none");
    }
  });

  it("prints the receipt flat, without the slack or its sag", () => {
    const { container } = render(
      <ReceiptPage site={SITE} kind="privacy" hosts={HOSTS} />,
    );
    expect(container.querySelector("main")!.className).toContain(
      "print:[transform:none]!",
    );
    expect(
      container.querySelector("[data-receipt-slack]")!.className,
    ).toContain("print:hidden");
    expect(
      container.querySelector("[data-receipt-frame]")!.className,
    ).toContain("print:pb-0");
  });

  it("rings the paper, not the whole screen, when the receipt has keyboard focus", () => {
    const { container } = render(
      <ReceiptPage site={SITE} kind="privacy" hosts={HOSTS} />,
    );
    expect(
      container.querySelector("[data-receipt-frame]")!.className,
    ).toContain("focus-visible:[outline:none]");
    expect(container.querySelector("[data-receipt-hang]")!.className).toContain(
      "[[data-receipt-frame]:focus-visible_&]:",
    );
  });

  it("tears on the frame with transform and opacity only, never on the whole paper", () => {
    const { container } = render(
      <ReceiptPage site={SITE} kind="privacy" hosts={HOSTS} />,
    );
    const frame = container.querySelector("[data-receipt-frame]")!;
    expect(frame.className).toMatch(
      /data-\[torn=fall\]:animate-\[receipt-fall_560ms/,
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
    "pawl-signed-in",
    "__Host-pawl_device",
    "1 year",
    "pawl:sound",
    "7 days without use",
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
