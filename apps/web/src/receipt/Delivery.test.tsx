import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SERIAL } from "@pawl/ui";

import type { CardState } from "../cabinet/card";
import {
  Delivery,
  passLine,
  type DeliveryBody,
  type DeliveryFacts,
} from "./Delivery";

const FACTS: DeliveryFacts = {
  bay: "7",
  item: "MANUAL",
  place: { word: "To", host: "docs.example.test" },
  pass: "VISITOR PASS",
  holder: "probe",
  printed: new Date(2026, 9, 19, 14, 3),
};

const CARD = {
  title: "Your DNS address",
  message: "Use it on your devices.",
  fields: [
    {
      label: "DNS address",
      value: "https://dns.elsewhere.test/dns-query/0123",
      copy: true,
    },
    { label: "Note", value: "Kept for you", copy: false },
  ],
  action: { label: "Detail", href: "https://enroll.elsewhere.test/" },
};

function printed(
  body: DeliveryBody,
  facts: DeliveryFacts = FACTS,
  copied: string | null = null,
) {
  const on = {
    open: vi.fn(),
    stay: vi.fn(),
    copy: vi.fn(),
    retry: vi.fn(),
    leave: vi.fn(),
  };
  const view = render(
    <Delivery
      siteName="Fixture"
      facts={facts}
      body={body}
      copied={copied}
      on={on}
    />,
  );
  return { on, ...view };
}

function carded(card: CardState) {
  return printed(
    { kind: "card", title: "DNS", card },
    { ...FACTS, place: { word: "From", host: "enroll.elsewhere.test" } },
  );
}

const LINK: DeliveryBody = {
  kind: "link",
  title: "Docs",
  href: "https://docs.example.test/",
  left: 10,
};

describe("a delivery receipt", () => {
  it("prints the serial, the app's name, the bay, the item, where it goes, the pass and the time", () => {
    const { container } = printed(LINK);
    const paper = container.textContent ?? "";
    expect(paper).toContain(`${SERIAL} · FIXTURE`);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Docs$/,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute(
      "id",
      "delivery-title",
    );
    const facts = Object.fromEntries(
      [...container.querySelectorAll("dt")].map((term) => [
        term.textContent,
        term.nextElementSibling?.textContent,
      ]),
    );
    expect(facts).toEqual({
      Bay: "7",
      Item: "MANUAL",
      To: "docs.example.test",
      Pass: "VISITOR PASS",
      Holder: "probe",
      Printed: "19 Oct 2026, 14:03",
    });
  });

  it("leaves the holder out for a guest and names the pass GUEST", () => {
    expect(passLine("guest")).toBe("GUEST");
    expect(passLine("owner")).toBe("OWNER PASS");
    const { container } = printed(LINK, {
      ...FACTS,
      pass: passLine("guest"),
      holder: null,
    });
    const terms = [...container.querySelectorAll("dt")].map(
      (term) => term.textContent,
    );
    expect(terms).not.toContain("Holder");
    expect(container).toHaveTextContent("GUEST");
  });

  it("counts down with Open now as a real link and Stay here", async () => {
    const { on } = printed(LINK);
    expect(screen.getByRole("timer")).toHaveTextContent("10");
    expect(screen.getByText(/Opening docs\.example\.test in/)).toBeVisible();
    const open = screen.getByRole("link", { name: /Open now/ });
    expect(open).toHaveAttribute("href", "https://docs.example.test/");
    await userEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(on.stay).toHaveBeenCalledOnce();
    open.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(open);
    expect(on.open).toHaveBeenCalledOnce();
  });

  it("says the count stopped and keeps Open now", () => {
    printed({ ...LINK, left: null });
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.queryByRole("button", { name: "Stay here" })).toBeNull();
    expect(
      screen.getByText("Stopped. Open it when you are ready."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Open now/ })).toBeVisible();
  });

  it("prints a card's own words under a From rule, with Copy on its fields and its action as a link", async () => {
    const { on, container } = carded({ kind: "shown", card: CARD });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your DNS address",
    );
    expect(container.querySelector("[data-receipt-from]")).toHaveTextContent(
      "From enroll.elsewhere.test",
    );
    expect(container.querySelector("[data-card-message]")).toHaveTextContent(
      "Use it on your devices.",
    );
    expect(
      [...container.querySelectorAll("[data-card-value]")].map(
        (value) => value.textContent,
      ),
    ).toEqual(["https://dns.elsewhere.test/dns-query/0123", "Kept for you"]);
    expect(container.querySelectorAll("[data-card-field]")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Copy / })).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("button", { name: "Copy DNS address" }),
    );
    expect(on.copy).toHaveBeenCalledWith(CARD.fields[0]);
    const detail = screen.getByRole("link", { name: "Detail ↗" });
    expect(detail).toHaveAttribute("href", "https://enroll.elsewhere.test/");
    detail.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(detail);
    expect(on.leave).toHaveBeenCalledWith(
      expect.anything(),
      "https://enroll.elsewhere.test/",
    );
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("says Copied on the field just copied", () => {
    printed(
      { kind: "card", title: "DNS", card: { kind: "shown", card: CARD } },
      FACTS,
      "DNS address",
    );
    expect(
      screen.getByRole("button", { name: "Copied DNS address" }),
    ).toHaveTextContent("Copied");
  });

  it("asks a first-time app to connect in the site's own words", async () => {
    const { on, container } = carded({
      kind: "connect",
      href: "https://paw.example.test/oauth/connect?app=dns",
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "DNS needs to know who you are",
    );
    expect(container).toHaveTextContent(
      "Fixture asks you once what it may see.",
    );
    expect(container).not.toHaveTextContent("Pawl");
    const connect = screen.getByRole("link", { name: /Connect/ });
    expect(connect).toHaveAttribute(
      "href",
      "https://paw.example.test/oauth/connect?app=dns",
    );
    connect.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(connect);
    expect(on.leave).toHaveBeenCalledWith(
      expect.anything(),
      "https://paw.example.test/oauth/connect?app=dns",
    );
  });

  it("prints -- with Try again when the app did not answer", async () => {
    const { on, container } = carded({ kind: "unreadable" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "DNS did not answer",
    );
    expect(container).toHaveTextContent("--");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(on.retry).toHaveBeenCalledOnce();
  });

  it("says One moment while the app is asked again", () => {
    carded({ kind: "loading" });
    expect(screen.getByText("One moment")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("prints nothing invented: its barcode holds the bay and the time printed", () => {
    const { container } = printed(LINK);
    const barcodes = container.querySelectorAll("[data-barcode]");
    expect(barcodes).toHaveLength(1);
    expect(barcodes[0]).toHaveAttribute("data-barcode", "7-1403");
    expect(barcodes[0]).toHaveTextContent("*7-1403*");
    expect(container).toHaveTextContent("— KEEP THIS RECEIPT —");
    expect(container.textContent).not.toMatch(/No\.|#\d/);
  });
});
