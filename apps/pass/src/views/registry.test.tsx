import { ApiError, apiFetch } from "@pawl/core";
import { screen } from "@testing-library/react";
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

const ADMIN = {
  id: "a1",
  email: "owner@b.test",
  username: "owner",
  role: "ADMIN" as const,
};

const USER = { ...ADMIN, id: "u1", username: "ana", role: "USER" as const };

const DNS = {
  key: "dns",
  label: "dns",
  title: "DNS",
  origin: "https://enroll.example.test",
  access: "visitor",
  card: true,
  clientId: "dns",
  redirectUri: "https://enroll.example.test/auth/callback",
  createdAt: "2026-10-15T10:00:00.000Z",
};

function served(apps: unknown[] = [DNS], user: unknown = ADMIN): void {
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path === "/api/account") return { user, providers: ["password"] };
    if (path === "/api/sessions") return { sessions: [] };
    if (path === "/api/account/grants") return { grants: [] };
    if (path === "/api/admin/apps") return { apps };
    return { ok: true };
  });
}

function go(): Promise<void> {
  return userEvent.click(
    document.querySelector<HTMLButtonElement>("button[form='screen-form']")!,
  );
}

beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(apiFetch).mockReset();
});

describe("registered apps on paw.", () => {
  it("is the fifth section of an admin's account, and no one else's", async () => {
    served();
    renderPass({ view: "account" }, { user: ADMIN });
    expect(
      screen.getByRole("button", { name: /Registered apps/ }),
    ).toBeVisible();
    await userEvent.keyboard("5");
    expect(
      screen.getByRole("heading", { name: "Registered apps" }),
    ).toBeVisible();
    expect(await screen.findByText("DNS")).toBeVisible();
    expect(screen.getByText(/enroll\.example\.test/)).toBeVisible();
  });

  it("is not offered to a visitor", async () => {
    served([DNS], USER);
    renderPass({ view: "account" }, { user: USER });
    expect(
      screen.queryByRole("button", { name: /Registered apps/ }),
    ).toBeNull();
    await userEvent.keyboard("5");
    expect(screen.getByRole("heading", { name: "ana" })).toBeVisible();
  });

  it("registers an app in three short steps and shows its secret once", async () => {
    served([]);
    vi.mocked(apiFetch).mockResolvedValue({
      app: { ...DNS },
      secret: "the-secret-shown-once",
    });
    renderPass({ view: "registry" }, { user: ADMIN });
    await userEvent.click(
      await screen.findByRole("button", { name: "New app" }),
    );
    await userEvent.type(screen.getByLabelText("Name"), "DNS");
    await userEvent.type(
      screen.getByLabelText("Address"),
      "https://enroll.example.test",
    );
    await go();
    expect(screen.getByLabelText("Label on the cartridge")).toHaveValue("dns");
    await userEvent.click(screen.getByRole("button", { name: "Visitors" }));
    await go();
    expect(screen.getByLabelText("Return address")).toHaveValue(
      "https://enroll.example.test/auth/callback",
    );
    expect(
      screen.getByRole("checkbox", { name: /card on the cabinet/ }),
    ).toBeChecked();
    await go();
    expect(apiFetch).toHaveBeenCalledWith("/api/admin/apps", {
      method: "POST",
      body: JSON.stringify({
        title: "DNS",
        label: "dns",
        address: "https://enroll.example.test",
        returnTo: "https://enroll.example.test/auth/callback",
        access: "visitor",
        card: true,
      }),
    });
    expect(
      await screen.findByRole("heading", { name: "Copy the secret now" }),
    ).toBeVisible();
    expect(screen.getByText("the-secret-shown-once")).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy Secret" })).toBeVisible();
  });

  it("asks to sign in again when the sign-in is too old to change apps", async () => {
    served([]);
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiError(
        "Sign in again to change registered apps. Your sign-in is older than 15 minutes.",
        403,
        "reauth_required",
      ),
    );
    renderPass({ view: "registry" }, { user: ADMIN });
    await userEvent.click(
      await screen.findByRole("button", { name: "New app" }),
    );
    await userEvent.type(screen.getByLabelText("Name"), "DNS");
    await userEvent.type(
      screen.getByLabelText("Address"),
      "https://enroll.example.test",
    );
    await go();
    await go();
    await go();
    expect(await screen.findByText(/older than 15 minutes/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeVisible();
  });

  it("removes an app after one confirmation", async () => {
    served();
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    renderPass({ view: "registry" }, { user: ADMIN });
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove DNS" }),
    );
    expect(screen.getByRole("heading", { name: "Remove DNS?" })).toBeVisible();
    await go();
    expect(apiFetch).toHaveBeenCalledWith("/api/admin/apps/dns", {
      method: "DELETE",
    });
    expect(await screen.findByText("DNS removed.")).toBeVisible();
  });
});
