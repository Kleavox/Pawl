import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CardState } from "./card";
import { CardView } from "./CardView";

const BAY = { code: "5", title: "DNS", product: "DNS" };

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

function shown(state: CardState, copied: string | null = null) {
  const on = {
    leave: vi.fn(),
    retry: vi.fn(),
    signIn: vi.fn(),
    copy: vi.fn(),
    back: vi.fn(),
  };
  const view = render(
    <CardView
      hidden={false}
      bay={BAY}
      state={state}
      said=""
      copied={copied}
      on={on}
    />,
  );
  return { on, ...view };
}

describe("an app's card on the cabinet's screen", () => {
  it("shows the app's own words, its fields with Copy, and its action", async () => {
    const { on } = shown({ kind: "shown", card: CARD });
    expect(
      screen.getByRole("heading", { name: CARD.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(CARD.message)).toBeInTheDocument();
    expect(screen.getByText(CARD.fields[0]!.value)).toBeInTheDocument();
    expect(screen.getByText("Kept for you")).toBeInTheDocument();
    const copies = screen.getAllByRole("button", { name: /^Copy/ });
    expect(copies).toHaveLength(1);
    await userEvent.click(copies[0]!);
    expect(on.copy).toHaveBeenCalledWith(CARD.fields[0]);
    const detail = screen.getByRole("link", { name: /Detail/ });
    expect(detail).toHaveAttribute("href", CARD.action.href);
    await userEvent.click(detail);
    expect(on.leave).toHaveBeenCalled();
  });

  it("says Copied on the field just copied", () => {
    shown({ kind: "shown", card: CARD }, "DNS address");
    expect(
      screen.getByRole("button", { name: "Copied DNS address" }),
    ).toHaveTextContent("Copied");
  });

  it("asks to connect in Pawl's own words, naming the app", () => {
    shown({ kind: "connect", href: "https://paw.example.test/oauth/connect" });
    expect(
      screen.getByRole("heading", { name: "DNS needs to know who you are" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Connect/ })).toHaveAttribute(
      "href",
      "https://paw.example.test/oauth/connect",
    );
  });

  it("never shows an empty card when the app did not answer", async () => {
    const { on } = shown({ kind: "unreadable" });
    expect(
      screen.getByRole("heading", { name: "DNS did not answer" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/--/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(on.retry).toHaveBeenCalled();
  });

  it("offers to sign in again once the session ended", async () => {
    const { on } = shown({ kind: "expired" });
    await userEvent.click(
      screen.getByRole("button", { name: "Sign in again" }),
    );
    expect(on.signIn).toHaveBeenCalled();
  });

  it("waits with a loader and always offers the way back", async () => {
    const { on, container } = shown({ kind: "loading" });
    expect(container.querySelector(".view__loader")).not.toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /Back to the bays/ }),
    );
    expect(on.back).toHaveBeenCalled();
  });
});
