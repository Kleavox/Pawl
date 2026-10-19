import { ApiError } from "@pawl/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../helpers";
import { OtpVerifyError, startOtp, verifyOtpCode } from "../otp";
import { renderPass } from "../test-kit";

vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: (props: { onSuccess: (token: string) => void }) => {
    useEffect(() => {
      props.onSuccess("human-token");
    }, []);
    return null;
  },
}));

vi.mock("@pawl/crypto", () => ({
  deriveLoginKeys: vi.fn(async () => ({ authVerifier: "verifier" })),
}));

vi.mock("../otp", async (actual) => ({
  ...(await actual<typeof import("../otp")>()),
  startOtp: vi.fn(),
  verifyOtpCode: vi.fn(),
}));

vi.mock("../helpers", async (actual) => ({
  ...(await actual<typeof import("../helpers")>()),
  api: vi.fn(),
}));

const USER = {
  id: "u1",
  email: "a@b.test",
  username: "ana_01",
  role: "USER" as const,
};

const asked = () =>
  new ApiError(
    "Confirm you are human, then try again.",
    403,
    "challenge_required",
  );

function panel(name: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-view-panel='${name}']`)!;
}

beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(startOtp).mockReset();
  vi.mocked(verifyOtpCode).mockReset();
  vi.mocked(api).mockImplementation(async (path: string) =>
    path === "/api/challenge" ? { ok: true, returnTo: "/" } : { ok: true },
  );
});

describe("a sign-in Pawl wants a human for", () => {
  it("passes the human check by itself, then sends the code", async () => {
    vi.mocked(startOtp).mockRejectedValueOnce(asked()).mockResolvedValue();
    renderPass({ view: "email" });
    await userEvent.type(screen.getByLabelText("Email address"), "a@b.test");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(panel("code")).toBeVisible());
    expect(api).toHaveBeenCalledWith("/api/challenge", {
      token: "human-token",
      scope: "basic",
      returnTo: undefined,
    });
    expect(startOtp).toHaveBeenCalledTimes(2);
  });

  it("passes it by itself before a code is checked", async () => {
    vi.mocked(verifyOtpCode)
      .mockRejectedValueOnce(new OtpVerifyError(asked(), undefined))
      .mockResolvedValue({
        authenticated: true,
        user: USER,
        needsSetup: false,
      });
    renderPass({ view: "code", email: "a@b.test", digits: "123456" });
    await userEvent.click(screen.getByRole("button", { name: /^GO/ }));
    await waitFor(() => expect(panel("account")).toBeVisible());
    expect(verifyOtpCode).toHaveBeenCalledTimes(2);
  });

  it("passes it by itself before a password is checked", async () => {
    let first = true;
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/api/challenge") return { ok: true, returnTo: "/" };
      if (path === "/api/login/prelogin") {
        if (first) {
          first = false;
          throw asked();
        }
        return { salt: "c2FsdA" };
      }
      if (path === "/api/login") return { authenticated: true, user: USER };
      return { ok: true };
    });
    renderPass({ view: "password" });
    const step = within(panel("password"));
    await userEvent.type(step.getByLabelText("Email"), "a@b.test");
    await userEvent.type(step.getByLabelText("Password"), "a long passphrase");
    await userEvent.click(screen.getByRole("button", { name: /^GO/ }));
    await waitFor(() => expect(panel("account")).toBeVisible());
    expect(api).toHaveBeenCalledWith("/api/login", {
      email: "a@b.test",
      authVerifier: "verifier",
    });
  });
});
