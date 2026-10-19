import { ApiError, apiFetch } from "@pawl/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../helpers";
import { renderPass } from "../test-kit";

vi.mock("../helpers", async (actual) => ({
  ...(await actual<typeof import("../helpers")>()),
  api: vi.fn(),
}));

vi.mock("@pawl/core", async (actual) => ({
  ...(await actual<typeof import("@pawl/core")>()),
  apiFetch: vi.fn(),
}));

const USER = {
  id: "u1",
  email: "ana@b.test",
  username: "ana_01",
  role: "USER" as const,
};

function device(index: number, current = false) {
  return {
    id: `s${index}`,
    userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0",
    ip: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    current,
  };
}

function served(options: {
  devices?: number;
  current?: boolean;
  apps?: number;
}): void {
  const sessions = Array.from({ length: options.devices ?? 0 }, (_, index) =>
    device(index, options.current === true && index === 0),
  );
  const grants = Array.from({ length: options.apps ?? 0 }, (_, index) => ({
    clientId: `c${index}`,
    name: `App ${index}`,
    homepage: null,
    sector: "notes.example",
    scopes: ["openid", "email"],
    createdAt: "2026-10-01T10:00:00.000Z",
  }));
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path === "/api/account") return { user: USER, providers: ["password"] };
    if (path === "/api/sessions") return { sessions };
    if (path === "/api/account/grants") return { grants };
    return { ok: true };
  });
  vi.mocked(apiFetch).mockResolvedValue({ ok: true });
}

beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(apiFetch).mockReset();
});

describe("an account whose pass ended", () => {
  const ENDED = "Your pass ended. Sign in to go on.";
  const signInFirst = () => new ApiError("Sign in first.", 401, "unauthorized");

  it("goes to the sign-in when a section cannot be read for it", async () => {
    served({});
    const serve = vi.mocked(api).getMockImplementation()!;
    vi.mocked(api).mockImplementation(async (path, body) => {
      if (path === "/api/sessions") throw signInFirst();
      return serve(path, body);
    });
    renderPass({ view: "devices" }, { user: USER });
    expect(await screen.findByText(ENDED)).toBeVisible();
    expect(
      screen.getByRole("heading", { name: /Sign in to Fixture/ }),
    ).toBeVisible();
  });

  it("goes to the sign-in when a step is refused for it", async () => {
    served({ devices: 2 });
    vi.mocked(apiFetch).mockRejectedValue(signInFirst());
    renderPass({ view: "devices" }, { user: USER });
    await userEvent.click(
      await screen.findByRole("button", { name: /Revoke session 2/ }),
    );
    expect(await screen.findByText(ENDED)).toBeVisible();
  });

  it("notices when the tab comes back after the pass ended elsewhere", async () => {
    served({});
    const serve = vi.mocked(api).getMockImplementation()!;
    vi.mocked(api).mockImplementation(async (path, body) =>
      path === "/api/session" ? { authenticated: false } : serve(path, body),
    );
    renderPass({ view: "account" }, { user: USER });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await screen.findByText(ENDED)).toBeVisible();
  });

  it("notices when the tab comes back signed in elsewhere", async () => {
    served({});
    const serve = vi.mocked(api).getMockImplementation()!;
    vi.mocked(api).mockImplementation(async (path, body) =>
      path === "/api/session"
        ? { authenticated: true, user: USER }
        : serve(path, body),
    );
    const { container } = renderPass({ view: "methods" }, { user: null });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() =>
      expect(
        container.querySelector("[data-view-panel='account']"),
      ).toBeVisible(),
    );
  });
});

describe("the account on paw.", () => {
  it("opens each section from the account menu with its digit", async () => {
    served({});
    renderPass({ view: "account" }, { user: USER });
    await userEvent.keyboard("3");
    expect(screen.getByRole("heading", { name: "Apps" })).toBeVisible();
  });

  it("shows three devices a page and moves with Next and the arrow keys", async () => {
    served({ devices: 7 });
    renderPass({ view: "devices" }, { user: USER });
    expect(
      await screen.findAllByRole("button", {
        name: /Revoke|Sign out of this device/,
      }),
    ).toHaveLength(3);
    expect(screen.getByText("Page 1 of 3")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Next ›" }));
    expect(screen.getByText("Page 2 of 3")).toBeVisible();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("Page 3 of 3")).toBeVisible();
  });

  it("leaves Alt with an arrow to the browser, it does not page", async () => {
    served({ devices: 7 });
    renderPass({ view: "devices" }, { user: USER });
    expect(await screen.findByText("Page 1 of 3")).toBeVisible();
    await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(screen.getByText("Page 1 of 3")).toBeVisible();
  });

  it("steps back a page when the last device on the last page is revoked", async () => {
    served({ devices: 4 });
    renderPass({ view: "devices", page: 1 }, { user: USER });
    await userEvent.click(
      await screen.findByRole("button", { name: /Revoke session 4/ }),
    );
    expect(await screen.findByText("Page 1 of 1")).toBeVisible();
  });

  it("signs out when the current device is revoked", async () => {
    served({ devices: 1, current: true });
    renderPass({ view: "devices" }, { user: USER });
    await userEvent.click(
      await screen.findByRole("button", { name: "Sign out of this device" }),
    );
    expect(await screen.findByText(/Sign in to Fixture/)).toBeVisible();
  });

  it("says so when no device holds the pass", async () => {
    served({ devices: 0 });
    renderPass({ view: "devices" }, { user: USER });
    expect(await screen.findByText("No device holds your pass.")).toBeVisible();
    expect(screen.queryByText("Page 1 of 1")).toBeNull();
  });

  it("says so when no outside app holds the pass", async () => {
    served({ apps: 0 });
    renderPass({ view: "apps" }, { user: USER });
    expect(
      await screen.findByText("No outside app holds your pass yet."),
    ).toBeVisible();
  });

  it("pages the apps three at a time too", async () => {
    served({ apps: 4 });
    renderPass({ view: "apps" }, { user: USER });
    expect(
      await screen.findAllByRole("button", { name: /^Disconnect/ }),
    ).toHaveLength(3);
    expect(screen.getByText("Page 1 of 2")).toBeVisible();
  });

  it("never sets a password shorter than twelve characters", async () => {
    served({});
    const { container } = renderPass({ view: "profile-key" }, { user: USER });
    const key = within(
      container.querySelector<HTMLElement>("[data-view-panel='profile-key']")!,
    );
    await userEvent.type(key.getByLabelText("New password"), "abc");
    await userEvent.type(key.getByLabelText("Confirm password"), "abc");
    await userEvent.click(screen.getByRole("button", { name: /^GO/ }));
    expect(key.getByRole("alert")).toHaveTextContent(
      "Use at least 12 characters.",
    );
    expect(api).not.toHaveBeenCalledWith(
      "/api/account/password",
      expect.anything(),
    );
  });

  it("says so on Devices when the devices could not be read, and reads them again on request", async () => {
    served({ devices: 2 });
    const serve = vi.mocked(api).getMockImplementation()!;
    let failing = true;
    vi.mocked(api).mockImplementation(
      async (path: string, body?: Record<string, unknown>) => {
        if (path === "/api/sessions" && failing) {
          throw new Error("The devices could not be read.");
        }
        return serve(path, body);
      },
    );
    renderPass({ view: "account" }, { user: USER });
    await userEvent.keyboard("2");
    expect(
      await screen.findByText("The devices could not be read."),
    ).toBeVisible();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findAllByRole("button", { name: /Revoke/ }),
    ).toHaveLength(2);
  });

  it("says so on Apps when the apps could not be read", async () => {
    served({ apps: 1 });
    const serve = vi.mocked(api).getMockImplementation()!;
    vi.mocked(api).mockImplementation(
      async (path: string, body?: Record<string, unknown>) => {
        if (path === "/api/account/grants") {
          throw new Error("The apps could not be read.");
        }
        return serve(path, body);
      },
    );
    renderPass({ view: "account" }, { user: USER });
    await userEvent.keyboard("3");
    expect(
      await screen.findByText("The apps could not be read."),
    ).toBeVisible();
  });

  it("names the holder, the pass and the sign-in methods", async () => {
    served({});
    renderPass({ view: "profile" }, { user: USER });
    expect(
      await screen.findByText("Password", { selector: "dd span" }),
    ).toBeVisible();
    expect(screen.getAllByText("ana@b.test").length).toBeGreaterThan(0);
    expect(screen.getByText("Visitor", { selector: "dd" })).toBeVisible();
  });
});
