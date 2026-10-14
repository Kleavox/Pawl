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
