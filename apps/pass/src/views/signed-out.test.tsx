import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { departTo } from "../depart";
import { api } from "../helpers";
import { startOtp, verifyOtpCode } from "../otp";
import { renderPass } from "../test-kit";

vi.mock("../otp", async (actual) => ({
  ...(await actual<typeof import("../otp")>()),
  startOtp: vi.fn(),
  verifyOtpCode: vi.fn(),
}));

vi.mock("../depart", async (actual) => ({
  ...(await actual<typeof import("../depart")>()),
  departTo: vi.fn(),
}));

vi.mock("../helpers", async (actual) => ({
  ...(await actual<typeof import("../helpers")>()),
  api: vi.fn(),
  returnTo: "https://example.test/auth/signin?returnTo=%2F&prompt=none",
  startOAuth: vi.fn(),
}));

function view(name: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-view-panel='${name}']`)!;
}

const USER = {
  id: "u1",
  email: "a@b.test",
  username: "ana_01",
  role: "USER" as const,
};

beforeEach(() => {
  vi.mocked(startOtp).mockReset();
  vi.mocked(verifyOtpCode).mockReset();
  vi.mocked(departTo).mockReset();
  vi.mocked(api).mockReset();
});

describe("signing in on paw.", () => {
  it("numbers the ways in, and the email code is one of them", async () => {
    renderPass(
      { view: "methods" },
      { providers: { google: true, github: false } },
    );
    expect(
      screen.getByRole("button", { name: /Continue with Google/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Email me a code/ }),
    ).toHaveAttribute("aria-keyshortcuts", "2");
    await userEvent.keyboard("2");
    expect(screen.getByLabelText("Email address")).toBeVisible();
  });

  it("sends the code, then the keypad's digits fill the cells and GO checks them", async () => {
    vi.mocked(startOtp).mockResolvedValue();
    vi.mocked(verifyOtpCode).mockResolvedValue({
      authenticated: true,
      user: USER,
      needsSetup: false,
    });
    renderPass({ view: "email" });
    await userEvent.type(screen.getByLabelText("Email address"), "a@b.test");
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText(/Type the 6 digits/)).toBeVisible();
    for (const digit of "123456") {
      await userEvent.click(
        screen.getByRole("button", { name: new RegExp(`^${digit}`) }),
      );
    }
    await userEvent.click(screen.getByRole("button", { name: /^GO/ }));
    expect(verifyOtpCode).toHaveBeenCalledWith("a@b.test", "123456");
    expect(departTo).toHaveBeenCalledOnce();
  });

  it("says how many tries are left after a wrong code, and starts the code again", async () => {
    const { OtpVerifyError } = await import("../otp");
    const { ApiError } = await import("@pawl/core");
    vi.mocked(verifyOtpCode).mockRejectedValue(
      new OtpVerifyError(new ApiError("Wrong code.", 400, "otp_invalid"), 3),
    );
    const { container } = renderPass({
      view: "code",
      email: "a@b.test",
      digits: "123456",
    });
    await userEvent.click(screen.getByRole("button", { name: /^GO/ }));
    expect(
      await screen.findByText(/That code was not right\. 3 tries left/),
    ).toBeVisible();
    expect(
      [...container.querySelectorAll("[data-code-cell]")].map(
        (cell) => cell.textContent,
      ),
    ).toEqual(["", "", "", "", "", ""]);
  });

  it("splits registering into who you are, then your key", async () => {
    renderPass({ view: "register" });
    const first = within(view("register"));
    expect(first.getByLabelText("Username")).toBeVisible();
    expect(first.queryByLabelText("Password")).toBeNull();
    await userEvent.type(first.getByLabelText("Username"), "ana_01");
    await userEvent.type(first.getByLabelText("Email"), "ana@b.test");
    await userEvent.click(screen.getByRole("button", { name: /^GO/ }));
    expect(
      within(view("register-key")).getByLabelText("Password"),
    ).toBeVisible();
  });

  it("never creates an account with a password shorter than twelve characters", async () => {
    renderPass({ view: "register-key" });
    const key = within(view("register-key"));
    await userEvent.type(key.getByLabelText("Password"), "abc");
    await userEvent.type(key.getByLabelText("Confirm password"), "abc");
    await userEvent.click(screen.getByRole("button", { name: /^GO/ }));
    expect(api).not.toHaveBeenCalledWith("/api/register", expect.anything());
    expect(within(view("register-key")).getByRole("alert")).toHaveTextContent(
      "Use at least 12 characters.",
    );
  });

  it("never sets an empty or short new password on reset", async () => {
    window.history.replaceState(null, "", "/reset?token=t0ken");
    renderPass({ view: "reset" });
    await userEvent.click(screen.getByRole("button", { name: /^GO/ }));
    await userEvent.type(
      within(view("reset")).getByLabelText("New password"),
      "short",
    );
    await userEvent.click(screen.getByRole("button", { name: /^GO/ }));
    expect(within(view("reset")).getByRole("alert")).toHaveTextContent(
      "Use at least 12 characters.",
    );
    expect(api).not.toHaveBeenCalledWith(
      "/api/password/reset",
      expect.anything(),
    );
    window.history.replaceState(null, "", "/");
  });

  it("takes an optional password only when it is long enough", async () => {
    vi.mocked(api).mockResolvedValue({ providers: ["google"] });
    renderPass({ view: "welcome-key" }, { user: { ...USER, username: null } });
    const key = within(view("welcome-key"));
    await userEvent.type(key.getByLabelText("Password (optional)"), "abc");
    await userEvent.type(key.getByLabelText("Confirm password"), "abc");
    await userEvent.click(screen.getByRole("button", { name: /^GO/ }));
    expect(within(view("welcome-key")).getByRole("alert")).toHaveTextContent(
      "Use at least 12 characters.",
    );
    expect(api).not.toHaveBeenCalledWith(
      "/api/account/setup",
      expect.anything(),
    );
  });

  it("leaves no address or password behind on the password step once it is left", async () => {
    renderPass({ view: "password" });
    const step = within(view("password"));
    await userEvent.type(step.getByLabelText("Email"), "ana@b.test");
    await userEvent.type(step.getByLabelText("Password"), "a secret phrase");
    await userEvent.click(
      step.getByRole("button", { name: "‹ Other ways to sign in" }),
    );
    await userEvent.click(
      within(view("methods")).getByRole("button", { name: /Use a password/ }),
    );
    expect(within(view("password")).getByLabelText("Email")).toHaveValue("");
    expect(within(view("password")).getByLabelText("Password")).toHaveValue("");
  });

  it("walks one step back on Escape, even from the code and from inside a field", async () => {
    renderPass({ view: "code", email: "a@b.test", digits: "123" });
    await userEvent.keyboard("{Escape}");
    expect(within(view("email")).getByLabelText("Email address")).toBeVisible();
    await userEvent.click(
      within(view("email")).getByLabelText("Email address"),
    );
    await userEvent.keyboard("{Escape}");
    expect(view("methods")).toBeVisible();
  });

  it("offers to skip the optional password after a username is picked", async () => {
    vi.mocked(api).mockResolvedValue({ ok: true, user: USER });
    renderPass({ view: "welcome-key" }, { user: { ...USER, username: null } });
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(departTo).toHaveBeenCalledOnce();
  });

  it("lights GO only once all six digits are in, and Backspace walks the code back", async () => {
    const { container } = renderPass({
      view: "code",
      email: "a@b.test",
      digits: "12",
    });
    expect(
      container.querySelector("button[form='screen-form']"),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}");
    expect(screen.getByLabelText("Email address")).toBeVisible();
    expect(screen.getByLabelText("Email address")).toHaveValue("a@b.test");
  });
});
