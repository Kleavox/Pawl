import type { PublicView } from "@pawl/registry";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CATALOG } from "../machine/catalog.testkit";
import {
  CRUMPLE_MS,
  FEED_MS,
  STEP_BACK_MS,
  SWALLOW_MS,
  TEAR_JERK_MS,
  TEAR_RIP_MS,
  THROW_MS,
} from "../receipt";
import { ReceiptPage } from "./ReceiptPage";

const SITE: PublicView = {
  site: { name: "Fixture" },
  tools: [],
  bays: CATALOG,
  footer: [],
};

const IN_HAND_MS = FEED_MS + TEAR_JERK_MS + TEAR_RIP_MS + STEP_BACK_MS;

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
    "prints the %s receipt from the machine's printer, with no header or footer",
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
      expect(main).toHaveAttribute("data-receipt-sheet");
      expect(main).toHaveAttribute("aria-labelledby", "receipt-title");
      expect(main.querySelector("article[data-receipt]")).not.toBeNull();
      expect(main.querySelector("a[data-tear]")).toBeNull();
      expect(main).not.toHaveTextContent("Tear off");
      expect(
        screen.getAllByRole("button", {
          name: "Crumple the receipt",
          hidden: true,
        }),
      ).toHaveLength(1);
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
    expect(
      screen
        .getByRole("main")
        .contains(
          screen.getByRole("heading", { level: 1, name: "Privacy policy" }),
        ),
    ).toBe(true);
  });

  it("has no slack and nothing that hangs", () => {
    const { container } = render(
      <ReceiptPage site={SITE} kind="privacy" hosts={HOSTS} />,
    );
    expect(container.querySelector("[data-receipt-slack]")).toBeNull();
    expect(container.innerHTML).not.toContain("sag-max");
  });

  it("prerenders the paper fed at the printer, so it reads without JavaScript", () => {
    const html = renderToStaticMarkup(
      <ReceiptPage site={SITE} kind="privacy" hosts={HOSTS} />,
    );
    expect(html).toContain('data-stage="feed"');
    expect(html).toContain('data-framing="printer"');
  });

  it("prints from the printer on arrival, tears and comes to hand as the camera steps back", async () => {
    vi.useFakeTimers();
    const { container } = render(
      <ReceiptPage site={SITE} kind="privacy" hosts={HOSTS} />,
    );
    const sheet = container.querySelector<HTMLElement>("[data-receipt-sheet]")!;
    const camera = container.querySelector<HTMLElement>("[data-camera]")!;
    expect(sheet.dataset.stage).toBe("feed");
    await act(() =>
      vi.advanceTimersByTimeAsync(FEED_MS + TEAR_JERK_MS + TEAR_RIP_MS),
    );
    expect(sheet.dataset.stage).toBe("hand");
    expect(camera.dataset.framing).toBe("whole");
    await act(() => vi.advanceTimersByTimeAsync(STEP_BACK_MS));
    expect(document.activeElement).toBe(
      container.querySelector("[data-receipt-frame]"),
    );
  });

  it.each([
    ["its button", "button"],
    ["Escape", "escape"],
  ] as const)(
    "crumples on %s and goes to the cabinet, with no camera hint, once the ball has landed",
    async (_, how) => {
      vi.useFakeTimers();
      const navigate = vi.fn();
      const { container } = render(
        <ReceiptPage
          site={SITE}
          kind="terms"
          hosts={HOSTS}
          navigate={navigate}
        />,
      );
      await act(() => vi.advanceTimersByTimeAsync(IN_HAND_MS));
      if (how === "button") {
        fireEvent.click(
          screen.getByRole("button", { name: "Crumple the receipt" }),
        );
      } else {
        fireEvent.keyDown(document, { key: "Escape" });
      }
      const sheet = container.querySelector<HTMLElement>(
        "[data-receipt-sheet]",
      )!;
      expect(sheet.dataset.stage).toBe("crumple");
      await act(() =>
        vi.advanceTimersByTimeAsync(CRUMPLE_MS + THROW_MS + SWALLOW_MS - 1),
      );
      expect(navigate).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(navigate).toHaveBeenCalledExactlyOnceWith("/");
    },
  );

  it("does not crumple while it is still printing", async () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    const { container } = render(
      <ReceiptPage
        site={SITE}
        kind="terms"
        hosts={HOSTS}
        navigate={navigate}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    await act(() => vi.advanceTimersByTimeAsync(IN_HAND_MS + 2000));
    expect(
      container.querySelector<HTMLElement>("[data-receipt-sheet]")!.dataset
        .stage,
    ).toBe("hand");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("holds the paper in hand when restored from the back/forward cache", async () => {
    vi.useFakeTimers();
    const { container } = render(
      <ReceiptPage site={SITE} kind="privacy" hosts={HOSTS} />,
    );
    await act(() => vi.advanceTimersByTimeAsync(IN_HAND_MS));
    const sheet = container.querySelector<HTMLElement>("[data-receipt-sheet]")!;
    const camera = container.querySelector<HTMLElement>("[data-camera]")!;
    sheet.dataset.stage = "gone";
    await act(async () => {
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(sheet.dataset.stage).toBe("hand");
    expect(camera.dataset.framing).toBe("whole");
  });

  it("names the receipt on the printer's LCD and says it is in your hand", () => {
    const { container } = render(
      <ReceiptPage site={SITE} kind="terms" hosts={HOSTS} />,
    );
    expect(container.querySelector("[data-screen]")).toHaveTextContent(
      "RECEIPT PRINTED",
    );
    expect(container.querySelector("[data-screen-sub]")).toHaveTextContent(
      "TERMS OF SERVICE",
    );
    expect(
      container.querySelector("[data-view-panel='receipt']"),
    ).toHaveTextContent("Your receipt is in your hand");
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
