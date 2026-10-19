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

  it("shows only the products, working, account and card views", async () => {
    const { container } = await opened(vi.fn());
    expect(
      [...container.querySelectorAll("[data-view-panel]")].map((view) =>
        view.getAttribute("data-view-panel"),
      ),
    ).toEqual(["products", "working", "account", "card"]);
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

  it("bridges to the address the delivered cartridge carries", async () => {
    const navigate = vi.fn();
    const { user, container } = await opened(navigate);
    const cartridge = container.querySelector<HTMLElement>(
      "[data-cartridge='3']",
    )!;
    cartridge.dataset.href = "#stay";
    await user.click(cartridge);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await user.click(
      container.querySelector<HTMLElement>("[data-tray-action]")!,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(navigate).toHaveBeenCalledWith("#stay");
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

async function cardOpened(navigate: (url: string) => void) {
  const opened_ = await opened(navigate);
  const { user, container } = opened_;
  await user.click(
    container.querySelector<HTMLElement>("[data-cartridge='5']")!,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  await user.click(container.querySelector<HTMLElement>("[data-tray-action]")!);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return opened_;
}

describe("an outside app with a card", () => {
  it("adds the outside app's bay after the page loads and shows its card on delivery", async () => {
    routed({ status: 200, body: { card: DNS_CARD } });
    const { container } = await cardOpened(vi.fn());
    const card = container.querySelector<HTMLElement>(
      "[data-view-panel='card']",
    )!;
    expect(card.hidden).toBe(false);
    expect(card.querySelector("h2")!.textContent).toBe("Your DNS address");
    expect(card.textContent).toContain("0123456789abcdef");
  });

  it("copies a field and says so on its button", async () => {
    routed({ status: 200, body: { card: DNS_CARD } });
    const { user } = await cardOpened(vi.fn());
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    await user.click(screen.getByRole("button", { name: "Copy Client ID" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(writeText).toHaveBeenCalledWith("0123456789abcdef");
    expect(
      screen.getByRole("button", { name: "Copied Client ID" }),
    ).toBeInTheDocument();
  });

  it("follows the app's action on GO, without a camera hint for the app", async () => {
    routed({ status: 200, body: { card: DNS_CARD } });
    const go = vi.fn();
    const { user, container } = await cardOpened(go);
    await user.click(container.querySelector<HTMLElement>("[data-key='GO']")!);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(go).toHaveBeenCalledWith("https://enroll.elsewhere.test/");
  });

  it("connects through Pawl on GO and remembers the bay for the way back", async () => {
    routed({
      status: 409,
      body: {
        code: "CONSENT_REQUIRED",
        connect: "https://paw.example.test/oauth/connect?client_id=dns",
      },
    });
    const go = vi.fn();
    const { user, container } = await cardOpened(go);
    expect(
      screen.getByRole("heading", { name: "DNS needs to know who you are" }),
    ).toBeInTheDocument();
    await user.click(container.querySelector<HTMLElement>("[data-key='GO']")!);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(sessionStorage.getItem("pawl:machine-request")).toBe("5");
    expect(go).toHaveBeenCalledWith(
      "https://paw.example.test/oauth/connect?client_id=dns#cam=screen",
    );
  });

  it("goes back to the bays on CLR", async () => {
    routed({ status: 502, body: { code: "APP_UNREADABLE" } });
    const { user, container } = await cardOpened(vi.fn());
    expect(
      screen.getByRole("heading", { name: "DNS did not answer" }),
    ).toBeInTheDocument();
    await user.click(container.querySelector<HTMLElement>("[data-key='CLR']")!);
    expect(
      container.querySelector<HTMLElement>("[data-view-panel='products']")!
        .hidden,
    ).toBe(false);
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

  it("signs in again by itself when an open card finds the session ended", async () => {
    routed({ status: 401, body: { code: "SESSION_EXPIRED" } });
    const go = vi.fn();
    await cardOpened(go);
    expect(sessionStorage.getItem("pawl:machine-request")).toBe("5");
    expect(go).toHaveBeenCalledWith(
      expect.stringMatching(/^\/auth\/signin\?returnTo=.*prompt=none$/u),
    );
  });

  it("says a sign-in did not finish and takes the note out of the address", async () => {
    window.history.replaceState(null, "", "/?signin=failed");
    await opened(vi.fn());
    expect(
      screen.getAllByText("SIGN-IN DID NOT FINISH").length,
    ).toBeGreaterThan(0);
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
