import type { PublicView } from "@pawl/registry";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CATALOG } from "../machine/catalog.testkit";
import { CabinetPage } from "./CabinetPage";

const SITE: PublicView = {
  site: { name: "Fixture" },
  tools: [],
  bays: CATALOG,
  footer: [],
};

function answer(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => answer({ authenticated: false })),
  );
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function opened(navigate: (url: string) => void) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(
    <CabinetPage
      site={SITE}
      passHref="https://paw.example.test"
      navigate={navigate}
    />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return { user, ...view };
}

describe("CabinetPage", () => {
  it("dollies into paw. once, however often SIGN IN is pressed", async () => {
    const go = vi.fn();
    const { user } = await opened(go);
    const button = screen.getByRole("button", { name: /SIGN IN/ });
    await user.click(button);
    await user.click(button);
    expect(screen.getByText("OPENING SIGN-IN")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(go).toHaveBeenCalledTimes(1);
    expect(go.mock.calls[0]![0]).toMatch(
      /^https:\/\/paw\.example\.test\/\?returnTo=.*#cam=screen$/,
    );
  });

  it("sends a locked tile to sign-in after its denied blink, remembering the bay, and only once with SIGN IN pressed too", async () => {
    const go = vi.fn();
    const { user, container } = await opened(go);
    await user.click(
      container.querySelector<HTMLElement>("[data-cartridge='1']")!,
    );
    expect(
      container.querySelector("[data-tile='1']")!.getAttribute("data-state"),
    ).toBe("denied");
    await user.click(screen.getByRole("button", { name: /SIGN IN/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(go).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("pawl:machine-request")).toBe("1");
  });

  it("shows only the products, working and account views", async () => {
    const { container } = await opened(vi.fn());
    expect(
      [...container.querySelectorAll("[data-view-panel]")].map((view) =>
        view.getAttribute("data-view-panel"),
      ),
    ).toEqual(["products", "working", "account"]);
  });

  it("releases an open bay from the keypad: the number, then GO", async () => {
    const { user, container } = await opened(vi.fn());
    await user.click(container.querySelector<HTMLElement>("[data-key='3']")!);
    expect(
      container.querySelector("[data-tile='3']")!.getAttribute("data-state"),
    ).toBe("selected");
    await user.click(container.querySelector<HTMLElement>("[data-key='GO']")!);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(
      container.querySelector("[data-tray]")!.getAttribute("data-tray"),
    ).toBe("3");
  });

  it("holds a bay pressed before the pass is read, then judges it by that pass", async () => {
    let reply!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path.includes("/api/session")) {
          return new Promise<Response>((resolve) => (reply = resolve));
        }
        return answer({ role: "USER", tools: {}, attention: [] });
      }),
    );
    const navigate = vi.fn();
    const { user, container } = await opened(navigate);
    await user.click(
      container.querySelector<HTMLElement>("[data-cartridge='1']")!,
    );
    reply(
      answer({
        authenticated: true,
        identity: {
          id: "u1",
          email: "ana@b.test",
          username: "ana_01",
          role: "USER",
        },
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(
      container.querySelector("[data-tray]")!.getAttribute("data-tray"),
    ).toBe("1");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("pulls back once, with the pull-back's own motion, when restored from the back/forward cache", async () => {
    const { container } = await opened(vi.fn());
    const camera = container.querySelector<HTMLElement>("[data-camera]")!;
    camera.dataset.framing = "screen";
    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event("pageshow"), { persisted: true }),
      );
    });
    expect(camera.dataset.framing).toBe("whole");
    expect(camera.dataset.moving).toBe("out");
  });

  it("stops holding a pressed bay when the pass cannot be read in time, and judges it as a guest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("/api/session")
          ? new Promise<Response>(() => undefined)
          : answer({ role: "USER", tools: {}, attention: [] }),
      ),
    );
    const navigate = vi.fn();
    const { user, container } = await opened(navigate);
    await user.click(
      container.querySelector<HTMLElement>("[data-cartridge='1']")!,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining("https://paw.example.test/?returnTo="),
    );
  });
});

const DNS_BAY = {
  ...CATALOG[0]!,
  code: "5",
  key: "dns",
  title: "DNS",
  product: "DNS",
  estate: false,
  access: "visitor" as const,
  href: "https://enroll.elsewhere.test",
  card: true,
};

const SIGNED_IN = {
  authenticated: true,
  identity: {
    id: "u1",
    email: "budi@example.test",
    username: "budi",
    role: "USER",
  },
};

const DNS_CARD = {
  title: "Your DNS address",
  message: "Use it on your devices.",
  fields: [{ label: "Client ID", value: "0123456789abcdef", copy: true }],
  action: { label: "Detail", href: "https://enroll.elsewhere.test/" },
};

function routed(card: { status: number; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const path = String(input);
      if (path.startsWith("/api/session")) return answer(SIGNED_IN);
      if (path.startsWith("/api/estate")) {
        return answer({ role: "USER", tools: {}, attention: [] });
      }
      if (path.startsWith("/api/catalog")) {
        return answer({ ...SITE, bays: [...CATALOG, DNS_BAY] });
      }
      if (path.startsWith("/api/apps/dns/card")) {
        return new Response(JSON.stringify(card.body), {
          status: card.status,
          headers: { "content-type": "application/json" },
        });
      }
      return answer({});
    }),
  );
}

const PRINTED_MS = 560 + 540 + 90 + 120;
const STEPPED_BACK_MS = 620;
const CRUMPLED_MS = 260 + 450 + 200;

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function stageOf(container: HTMLElement): string | undefined {
  return container.querySelector<HTMLElement>("[data-receipt-sheet]")?.dataset
    .stage;
}

async function delivered(
  navigate: (url: string) => void,
  bay: string,
  href?: string,
) {
  const opened_ = await opened(navigate);
  const { user, container } = opened_;
  const cartridge = container.querySelector<HTMLElement>(
    `[data-cartridge='${bay}']`,
  )!;
  if (href !== undefined) cartridge.dataset.href = href;
  await user.click(cartridge);
  await advance(1500);
  return opened_;
}

async function taken(
  navigate: (url: string) => void,
  bay = "3",
  href: string | undefined = "#stay",
) {
  const opened_ = await delivered(navigate, bay, href);
  await opened_.user.click(
    opened_.container.querySelector<HTMLElement>("[data-tray-action]")!,
  );
  return opened_;
}

async function inHand(container: HTMLElement): Promise<void> {
  await advance(PRINTED_MS);
  expect(stageOf(container)).toBe("hand");
  await advance(STEPPED_BACK_MS);
}

describe("taking a delivery prints a receipt", () => {
  it("looks at the printer at once and prints the delivery, without a page load", async () => {
    const navigate = vi.fn();
    const { container } = await taken(navigate);
    const camera = container.querySelector<HTMLElement>("[data-camera]")!;
    expect(camera.dataset.framing).toBe("printer");
    expect(container.querySelector("[data-tray]")).toHaveAttribute(
      "data-tray",
      "none",
    );
    expect(
      container.querySelector("dialog[data-delivery]"),
      "the paper comes out in a frame of its own, once the camera is at the printer",
    ).not.toHaveAttribute("open");
    expect(stageOf(container)).toBeUndefined();
    await advance(560);
    expect(container.querySelector("dialog[data-delivery]")).toHaveAttribute(
      "open",
    );
    await advance(PRINTED_MS - 560);
    expect(stageOf(container)).toBe("hand");
    await advance(STEPPED_BACK_MS);
    expect(camera.dataset.framing).toBe("whole");
    expect(
      screen.getByRole("heading", { level: 1, name: "Docs" }),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(
      container.querySelector("article[data-receipt]"),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens a link-away app ten seconds after the paper is in hand", async () => {
    const navigate = vi.fn();
    const { container } = await taken(navigate);
    await inHand(container);
    expect(screen.getByRole("timer")).toHaveTextContent("10");
    await advance(9_000);
    expect(navigate).not.toHaveBeenCalled();
    await advance(1_100);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("#stay");
  });

  it("opens it at once on Open now", async () => {
    const navigate = vi.fn();
    const { container, user } = await taken(navigate);
    await inHand(container);
    await user.click(screen.getByRole("link", { name: /Open now/ }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("#stay");
    await advance(15_000);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("never opens it after Stay here", async () => {
    const navigate = vi.fn();
    const { container, user } = await taken(navigate);
    await inHand(container);
    await user.click(screen.getByRole("button", { name: "Stay here" }));
    await advance(20_000);
    expect(navigate).not.toHaveBeenCalled();
    expect(
      screen.getByText("Stopped. Open it when you are ready."),
    ).toBeInTheDocument();
  });

  it("never opens the app after a crumple made while the paper was still rising", async () => {
    const navigate = vi.fn();
    const { container, user } = await taken(navigate);
    await advance(PRINTED_MS + 100);
    expect(stageOf(container)).toBe("hand");
    await user.keyboard("{Escape}");
    await advance(CRUMPLED_MS + 15_000);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("counts from ten while it prints, and holds a Stay here pressed before the count began", async () => {
    const navigate = vi.fn();
    const { container, user } = await taken(navigate);
    await advance(560 + 300);
    expect(stageOf(container)).toBe("feed");
    expect(screen.getByRole("timer")).toHaveTextContent("10");
    expect(screen.queryByText(/Stopped/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Stay here" }));
    await advance(PRINTED_MS + STEPPED_BACK_MS + 15_000);
    expect(navigate).not.toHaveBeenCalled();
    expect(
      screen.getByText("Stopped. Open it when you are ready."),
    ).toBeInTheDocument();
  });

  it("opens the paper in a frame of its own on a second take from the same page too", async () => {
    const navigate = vi.fn();
    const { container, user } = await taken(navigate);
    await inHand(container);
    await user.keyboard("{Escape}");
    await advance(CRUMPLED_MS);
    const cartridge = container.querySelector<HTMLElement>(
      "[data-cartridge='3']",
    )!;
    await user.click(cartridge);
    await advance(1500);
    await user.click(
      container.querySelector<HTMLElement>("[data-tray-action]")!,
    );
    expect(
      container.querySelector("dialog[data-delivery]"),
    ).not.toHaveAttribute("open");
    expect(stageOf(container)).toBeUndefined();
    await advance(560);
    expect(container.querySelector("dialog[data-delivery]")).toHaveAttribute(
      "open",
    );
    await advance(PRINTED_MS - 560 + STEPPED_BACK_MS);
    expect(screen.getByRole("timer")).toHaveTextContent("10");
  });

  it.each(["Escape", "Crumple"] as const)(
    "puts the receipt in the tray on %s, empties it and hands focus back to the bays",
    async (how) => {
      const navigate = vi.fn();
      const { container, user } = await taken(navigate);
      await inHand(container);
      if (how === "Escape") await user.keyboard("{Escape}");
      else {
        await user.click(
          screen.getByRole("button", { name: "Crumple the receipt" }),
        );
      }
      expect(stageOf(container)).toBe("crumple");
      await advance(CRUMPLED_MS);
      expect(
        container.querySelector("dialog[data-delivery]"),
      ).not.toHaveAttribute("open");
      expect(container.querySelector("[data-tray]")).toHaveAttribute(
        "data-tray",
        "none",
      );
      expect(
        container
          .querySelector("[data-view-panel='products']")!
          .contains(document.activeElement),
      ).toBe(true);
      await advance(15_000);
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it("shows the whole machine and no receipt when restored from the back/forward cache after the app opened", async () => {
    const navigate = vi.fn();
    const { container } = await taken(navigate);
    await inHand(container);
    await advance(10_100);
    expect(navigate).toHaveBeenCalledOnce();
    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event("pageshow"), { persisted: true }),
      );
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(
      container.querySelector("dialog[data-delivery]"),
    ).not.toHaveAttribute("open");
    expect(container.querySelector("[data-tray]")).toHaveAttribute(
      "data-tray",
      "none",
    );
    expect(
      container.querySelector<HTMLElement>("[data-camera]")!.dataset.framing,
    ).toBe("whole");
    await advance(15_000);
    expect(navigate).toHaveBeenCalledOnce();
  });
});

function cardCalls(): string[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(([input]) => String(input))
    .filter((path) => path.startsWith("/api/apps/dns/card"));
}

describe("an outside app's card prints on the receipt", () => {
  it("asks for the card when the cartridge lands, and prints it on TAKE DELIVERY without asking again", async () => {
    routed({ status: 200, body: { card: DNS_CARD } });
    const { container, user } = await delivered(vi.fn(), "5");
    expect(cardCalls()).toHaveLength(1);
    await user.click(
      container.querySelector<HTMLElement>("[data-tray-action]")!,
    );
    await inHand(container);
    expect(cardCalls()).toHaveLength(1);
    const paper = container.querySelector("[data-receipt]")!;
    expect(paper.querySelector("h1")).toHaveTextContent("Your DNS address");
    expect(paper).toHaveTextContent("0123456789abcdef");
    expect(paper).toHaveTextContent("From enroll.elsewhere.test");
    expect(screen.queryByRole("timer")).toBeNull();
    expect(
      container.querySelector("[data-view-panel='products']"),
    ).not.toHaveAttribute("hidden");
  });

  it("keeps the paper in the slot until a slow card answers, and prints -- with Try again when it never does", async () => {
    routed({ status: 200, body: { card: DNS_CARD } });
    const answered = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      String(input).startsWith("/api/apps/dns/card")
        ? new Promise<Response>((_, fail) =>
            setTimeout(() => fail(new Error("timed out")), 10_000),
          )
        : answered(input, init),
    );
    const { container, user } = await delivered(vi.fn(), "5");
    await user.click(
      container.querySelector<HTMLElement>("[data-tray-action]")!,
    );
    await advance(2_000);
    expect(stageOf(container)).toBeUndefined();
    await advance(8_000);
    await inHand(container);
    expect(container.querySelector("[data-receipt] h1")).toHaveTextContent(
      "DNS did not answer",
    );
    expect(container.querySelector("[data-receipt]")).toHaveTextContent("--");
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("signs in again without printing when the card says the session ended", async () => {
    routed({ status: 401, body: { code: "SESSION_EXPIRED" } });
    const go = vi.fn();
    const { container, user } = await delivered(go, "5");
    await user.click(
      container.querySelector<HTMLElement>("[data-tray-action]")!,
    );
    await advance(0);
    expect(sessionStorage.getItem("pawl:machine-request")).toBe("5");
    expect(go).toHaveBeenCalledWith(
      expect.stringMatching(/^\/auth\/signin\?returnTo=.*prompt=none$/u),
    );
    await advance(PRINTED_MS);
    expect(stageOf(container)).toBeUndefined();
  });

  it("connects through Pawl from the paper and remembers the bay", async () => {
    routed({
      status: 409,
      body: {
        code: "CONSENT_REQUIRED",
        connect: "https://paw.example.test/oauth/connect?client_id=dns",
      },
    });
    const go = vi.fn();
    const { container, user } = await delivered(go, "5");
    await user.click(
      container.querySelector<HTMLElement>("[data-tray-action]")!,
    );
    await inHand(container);
    expect(
      screen.getByRole("heading", { name: "DNS needs to know who you are" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: /Connect/ }));
    await advance(700);
    expect(sessionStorage.getItem("pawl:machine-request")).toBe("5");
    expect(go).toHaveBeenCalledWith(
      "https://paw.example.test/oauth/connect?client_id=dns#cam=screen",
    );
  });

  it("says so when this browser cannot hold the bay for the way back from Connect", async () => {
    routed({
      status: 409,
      body: {
        code: "CONSENT_REQUIRED",
        connect: "https://paw.example.test/oauth/connect?client_id=dns",
      },
    });
    const { container, user } = await delivered(vi.fn(), "5");
    await user.click(
      container.querySelector<HTMLElement>("[data-tray-action]")!,
    );
    await inHand(container);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });
    await user.click(screen.getByRole("link", { name: /Connect/ }));
    expect(
      container.querySelector("[data-view-panel='products'] [data-say]"),
    ).toHaveTextContent("This browser cannot hold your bay request.");
    vi.mocked(Storage.prototype.setItem).mockRestore();
  });

  it("follows the app's action from the paper, without a camera hint for the app", async () => {
    routed({ status: 200, body: { card: DNS_CARD } });
    const go = vi.fn();
    const { container, user } = await delivered(go, "5");
    await user.click(
      container.querySelector<HTMLElement>("[data-tray-action]")!,
    );
    await inHand(container);
    await user.click(screen.getByRole("link", { name: "Detail ↗" }));
    await advance(700);
    expect(go).toHaveBeenCalledWith("https://enroll.elsewhere.test/");
  });

  it("takes what was said behind the paper away with the paper", async () => {
    routed({ status: 200, body: { card: DNS_CARD } });
    const { container, user } = await delivered(vi.fn(), "5");
    await user.click(
      container.querySelector<HTMLElement>("[data-tray-action]")!,
    );
    await inHand(container);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn(async () => {
          throw new Error("no clipboard");
        }),
      },
      configurable: true,
    });
    await user.click(screen.getByRole("button", { name: "Copy Client ID" }));
    await advance(0);
    const say = () =>
      container.querySelector("[data-view-panel='products'] [data-say]");
    expect(say()).toHaveTextContent("Copy did not work here.");
    await user.keyboard("{Escape}");
    await advance(CRUMPLED_MS);
    expect(stageOf(container)).toBeUndefined();
    expect(say()).toHaveTextContent(/^$/);
  });

  it("copies a card field and says so on its button", async () => {
    routed({ status: 200, body: { card: DNS_CARD } });
    const { container, user } = await delivered(vi.fn(), "5");
    await user.click(
      container.querySelector<HTMLElement>("[data-tray-action]")!,
    );
    await inHand(container);
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    await user.click(screen.getByRole("button", { name: "Copy Client ID" }));
    await advance(0);
    expect(writeText).toHaveBeenCalledWith("0123456789abcdef");
    expect(
      screen.getByRole("button", { name: "Copied Client ID" }),
    ).toBeInTheDocument();
  });
});

describe("a cabinet that keeps up with the pass", () => {
  it("asks for the pass, the catalog and the estate at once, each with a time limit", async () => {
    let reply!: (response: Response) => void;
    const fetching = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/api/session")
        ? new Promise<Response>((resolve) => (reply = resolve))
        : answer({ role: "USER", tools: {}, attention: [] }),
    );
    vi.stubGlobal("fetch", fetching);
    await opened(vi.fn());
    const asked = fetching.mock.calls.map(([input]) => String(input));
    expect(asked).toEqual(
      expect.arrayContaining(["/api/session", "/api/catalog", "/api/estate"]),
    );
    for (const call of fetching.mock.calls) {
      const init = (call as unknown[])[1] as RequestInit | undefined;
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    await act(async () => {
      reply(answer({ authenticated: false }));
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  it("lays out the bays from the catalog without waiting for the estate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path.startsWith("/api/session")) return answer(SIGNED_IN);
        if (path.startsWith("/api/catalog")) {
          return answer({ ...SITE, bays: [...CATALOG, DNS_BAY] });
        }
        return new Promise<Response>(() => undefined);
      }),
    );
    const { container } = await opened(vi.fn());
    expect(container.querySelector("[data-cartridge='5']")).not.toBeNull();
  });

  it("says a sign-in did not finish and takes the note out of the address", async () => {
    window.history.replaceState(null, "", "/?signin=failed");
    await opened(vi.fn());
    expect(screen.getAllByText("NOT SIGNED IN").length).toBeGreaterThan(0);
    expect(window.location.search).toBe("");
  });

  it("reads the pass again when the page comes back from the back/forward cache", async () => {
    const { container } = await opened(vi.fn());
    expect(screen.getByRole("button", { name: /SIGN IN/ })).toBeVisible();
    routed({ status: 200, body: { card: DNS_CARD } });
    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event("pageshow"), { persisted: true }),
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(
      container.querySelector("[data-machine]")?.getAttribute("data-access") ??
        container.querySelector("[data-access]")?.getAttribute("data-access"),
    ).toBe("visitor");
  });
});

describe("the 4-2-3-1 service menu", () => {
  async function press(
    user: Awaited<ReturnType<typeof opened>>["user"],
    container: HTMLElement,
    ...keys: string[]
  ): Promise<void> {
    for (const key of keys) {
      await user.click(
        container.querySelector<HTMLElement>(`[data-key='${key}']`)!,
      );
    }
  }

  function lcd(container: HTMLElement): [string, string] {
    return [
      container.querySelector("[data-screen]")!.textContent ?? "",
      container.querySelector("[data-screen-sub]")!.textContent ?? "",
    ];
  }

  function credit(container: HTMLElement): string | undefined {
    return container.querySelector<HTMLElement>("[data-part='credit']")!.dataset
      .credit;
  }

  it("opens on 4, 2, 3, 1 pressed on dark and lit keys alike, keeping the picked bay as it was", async () => {
    const { user, container } = await opened(vi.fn());
    await press(user, container, "4", "2", "3", "1");
    expect(container.querySelector("[data-cabinet-word]")).toHaveTextContent(
      "SERVICE MODE",
    );
    expect(
      container.querySelector("[data-view-panel='products']"),
    ).toHaveAttribute("inert");
    expect(lcd(container)).toEqual(["SERVICE 1 ERROR", "NONE"]);
    expect(credit(container)).toBe("SEr1");
    expect(
      container.querySelector("[data-tile='3']")!.getAttribute("data-state"),
    ).toBe("selected");
  });

  it("hands the machine back exactly as it was on CLR, so GO releases the bay picked before", async () => {
    const { user, container } = await opened(vi.fn());
    await press(user, container, "4", "2", "3", "1", "CLR");
    expect(lcd(container)).toEqual(["03 MANUAL", "PRESS GO TO TAKE"]);
    await press(user, container, "GO");
    await advance(1500);
    expect(
      container.querySelector("[data-tray]")!.getAttribute("data-tray"),
    ).toBe("3");
  });

  it("leaves service mode when the delivery is taken, so the paper is read like any other", async () => {
    const { user, container } = await delivered(vi.fn(), "3");
    await press(user, container, "4", "2", "3", "1");
    expect(container.querySelector("[data-cabinet-word]")).toHaveTextContent(
      "SERVICE MODE",
    );
    await user.click(
      container.querySelector<HTMLElement>("[data-tray-action]")!,
    );
    expect(
      container.querySelector("[data-cabinet-word]"),
    ).not.toHaveTextContent("SERVICE MODE");
    await advance(560);
    await inHand(container);
    expect(lcd(container)[0]).toBe("RECEIPT PRINTED");
    await user.keyboard("{Escape}");
    await advance(CRUMPLED_MS);
    expect(stageOf(container)).toBeUndefined();
  });

  it("names a session that could not be read as the last error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (String(input).startsWith("/api/session")) {
          throw new TypeError("offline");
        }
        return answer({});
      }),
    );
    const { user, container } = await opened(vi.fn());
    expect(lcd(container)[0]).toBe("PASS UNREADABLE");
    await press(user, container, "4", "2", "3", "1");
    expect(lcd(container)).toEqual(["SERVICE 1 ERROR", "PASS UNREADABLE"]);
  });

  it("counts what was vended this page under SALE, and says CASH is free", async () => {
    const { user, container } = await delivered(vi.fn(), "3");
    await press(user, container, "4", "2", "3", "1", "2");
    expect(lcd(container)).toEqual(["SERVICE 2 SALE", "1 SOLD THIS PAGE"]);
    await press(user, container, "3");
    expect(lcd(container)).toEqual(["SERVICE 3 CASH", "0.00 · FREE VEND"]);
    expect(credit(container)).toBe("SEr3");
  });

  it("runs the lamp test on 4 then GO", async () => {
    const { user, container } = await opened(vi.fn());
    await press(user, container, "4", "2", "3", "1", "4", "GO");
    const machine = container.querySelector("[data-machine]")!;
    expect(machine).toHaveAttribute("data-lamp-test");
    expect(credit(container)).toBe("8888");
    await advance(1200);
    expect(machine).not.toHaveAttribute("data-lamp-test");
    expect(credit(container)).toBe("SEr4");
  });

  it("prints a DEX audit on 5 then GO, held and crumpled like any paper", async () => {
    const { user, container } = await opened(vi.fn());
    await press(user, container, "4", "2", "3", "1", "5", "GO");
    await advance(560);
    await inHand(container);
    expect(
      screen.getByRole("heading", { level: 1, name: "Machine audit" }),
    ).toBeInTheDocument();
    const dex = container.querySelector("pre[data-dex]")!.textContent ?? "";
    expect(dex).toMatch(/^DXS\*PAWL-GW-01\*VA\*V1\/1\*1\n/);
    expect(dex).toMatch(/\nEA3\*1\nG85\*[0-9A-F]{4}\n/);
    expect(lcd(container)).toEqual(["AUDIT PRINTED", "DEX/UCS"]);
    expect(
      container.querySelector("[data-cabinet-word]"),
    ).not.toHaveTextContent("SERVICE MODE");
    await user.keyboard("{Escape}");
    await advance(CRUMPLED_MS);
    expect(stageOf(container)).toBeUndefined();
  });

  it("hands the bays back on CLR, and 1 then picks bay 1 again", async () => {
    const { user, container } = await opened(vi.fn());
    await press(user, container, "4", "2", "3", "1");
    expect(container.querySelector("[data-cabinet-word]")).toHaveTextContent(
      "SERVICE MODE",
    );
    await press(user, container, "CLR");
    expect(container.querySelector("[data-cabinet-word]")).toHaveTextContent(
      "GUEST MODE",
    );
    expect(
      container.querySelector("[data-view-panel='products']"),
    ).not.toHaveAttribute("inert");
    expect(credit(container)).toBe("FrEE");
    await press(user, container, "1");
    expect(
      container.querySelector("[data-tile='1']")!.getAttribute("data-state"),
    ).toBe("selected");
  });

  it("keeps the lamp test on for its full time after a second GO, and ends it on CLR", async () => {
    const { user, container } = await opened(vi.fn());
    await press(user, container, "4", "2", "3", "1", "4", "GO");
    await advance(800);
    await press(user, container, "GO");
    await advance(800);
    const machine = container.querySelector("[data-machine]")!;
    expect(machine).toHaveAttribute("data-lamp-test");
    await press(user, container, "CLR");
    expect(machine).not.toHaveAttribute("data-lamp-test");
    await press(user, container, "4", "2", "3", "1", "4", "GO", "CLR");
    await advance(1200);
    expect(machine).not.toHaveAttribute("data-lamp-test");
  });

  it("moves focus from a tile to the keypad on entering, and back on leaving", async () => {
    const { user, container } = await opened(vi.fn());
    const tile = container.querySelector<HTMLElement>("[data-cartridge='3']")!;
    tile.focus();
    await user.keyboard("4231");
    expect(container.querySelector("[data-cabinet-word]")).toHaveTextContent(
      "SERVICE MODE",
    );
    expect(document.activeElement).toBe(
      container.querySelector("[data-key='GO']"),
    );
    await user.keyboard("{Backspace}");
    expect(document.activeElement).toBe(tile);
  });

  it("lets a keyboard that came from a tile run the lamp test with Enter", async () => {
    const { user, container } = await opened(vi.fn());
    container.querySelector<HTMLElement>("[data-cartridge='3']")!.focus();
    await user.keyboard("4231");
    await user.keyboard("4");
    await user.keyboard("{Enter}");
    expect(container.querySelector("[data-machine]")).toHaveAttribute(
      "data-lamp-test",
    );
    expect(container.querySelector("[data-screen]")).toHaveTextContent(
      "SERVICE 4 TEST",
    );
  });

  it("leaves on Escape too", async () => {
    const { user, container } = await opened(vi.fn());
    await press(user, container, "4", "2", "3", "1");
    expect(container.querySelector("[data-cabinet-word]")).toHaveTextContent(
      "SERVICE MODE",
    );
    await user.keyboard("{Escape}");
    expect(container.querySelector("[data-cabinet-word]")).toHaveTextContent(
      "GUEST MODE",
    );
  });
});
