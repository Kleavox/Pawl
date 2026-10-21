import { expect, test, type Page } from "@playwright/test";
import { localWorkerOrigin } from "@pawl/topology";

import {
  clearRateLimits,
  freshAccount,
  goKey,
  PROBE_PASSWORD,
  view,
} from "./pass-account";

const GATEWAY = localWorkerOrigin("gateway", "localhost");
const PASS = localWorkerOrigin("pass", "localhost");
const CABINET = "http://127.0.0.1:8786";

function sessionOf(user: {
  email: string;
  username: string | null;
  role?: "USER" | "ADMIN";
}) {
  const identity = { id: "probe", role: "USER", ...user };
  return { authenticated: true, user: identity, identity };
}

async function signInFromCabinet(page: Page): Promise<void> {
  await page.goto(CABINET);
  await page.waitForLoadState("networkidle");
  await page.locator("[data-sign-in]").click();
  await expect(view(page, "methods")).toBeVisible({ timeout: 20_000 });
}

async function reachCode(page: Page): Promise<string> {
  if (!(await view(page, "methods").isVisible())) {
    await page.goto(`${PASS}/`);
  }
  await view(page, "methods").locator("[data-method='email']").click();
  const email = `otpprobe-${Date.now().toString().slice(-6)}@example.com`;
  await view(page, "email").locator("#code-email").fill(email);
  await view(page, "email").getByRole("button", { name: "Send code" }).click();
  await expect(view(page, "code")).toBeVisible({ timeout: 20_000 });
  return email;
}

async function typeCode(page: Page, code: string): Promise<void> {
  for (const digit of code) await page.locator(`[data-key='${digit}']`).click();
}

function acceptCode(
  page: Page,
  user: { email: string; username: string | null },
) {
  let accepted = false;
  const answered = page.route("**/api/auth/otp/verify", (route) => {
    accepted = true;
    return route.fulfill({
      json: {
        authenticated: true,
        user: { id: "probe", role: "USER", ...user },
        needsSetup: user.username === null,
      },
    });
  });
  const session = page.route("**/api/session", (route) =>
    accepted ? route.fulfill({ json: sessionOf(user) }) : route.continue(),
  );
  return Promise.all([answered, session]);
}

test("paw.'s sign-in lives on its screen, not in a dialog", async ({
  page,
}) => {
  await page.goto(`${PASS}/`);
  const methods = view(page, "methods");
  await expect(methods).toBeVisible();
  expect(
    await methods.evaluate((node) => ({
      dialog: node.closest("dialog") !== null,
      onScreen: node.closest(".screen") !== null,
    })),
  ).toEqual({ dialog: false, onScreen: true });
  await expect(page.locator("[data-view-panel]:visible")).toHaveCount(1);
  await expect(methods.locator("[data-method]").first()).toBeFocused();
});

test("while the scan line sweeps, the old screen's ghost hides the new one below it", async ({
  page,
}) => {
  await page.goto(`${PASS}/`);
  await expect(view(page, "methods")).toBeVisible();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { ghosts: string[] }).ghosts = seen;
    new MutationObserver(() => {
      const node = document.querySelector(".screen__window > .screen__ghost");
      if (node !== null) seen.push(getComputedStyle(node).backgroundImage);
    }).observe(document.body, { childList: true, subtree: true });
  });
  await view(page, "methods").locator("[data-method='email']").click();
  const ghost = await page.evaluate(
    () => (window as unknown as { ghosts: string[] }).ghosts[0] ?? null,
  );
  expect(ghost, "a ghost is on screen during the wipe").not.toBeNull();
  expect(ghost, "the ghost paints the screen's glass").not.toBe("none");
});

test("a step back walks one step, and ‹ MACHINE leaves for the cabinet", async ({
  page,
}) => {
  await page.goto(`${PASS}/`);
  await view(page, "methods").locator("[data-method='email']").click();
  await expect(view(page, "email")).toBeVisible();
  await page.locator("[data-key='CLR']").click();
  await expect(view(page, "methods")).toBeVisible();
  await view(page, "methods").locator("[data-method='password']").click();
  await view(page, "password")
    .getByRole("button", { name: "‹ Sign-in options" })
    .click();
  await expect(view(page, "methods")).toBeVisible();
  await view(page, "methods").locator("[data-to-machine]").click();
  await expect(page).toHaveURL(/:8786\/(#cam=screen)?$/, { timeout: 10_000 });
});

test("SIGN IN dollies into paw. and lands on its sign-in", async ({ page }) => {
  await page.goto(`${GATEWAY}/`);
  await page.waitForLoadState("networkidle");
  await page.locator("[data-sign-in]").click();
  await expect(page.locator("[data-camera]")).toHaveAttribute(
    "data-framing",
    "screen",
  );
  await expect(page).toHaveURL(/:8787\/\?returnTo=/, { timeout: 10_000 });
  await expect(view(page, "methods")).toBeVisible();
});

test("a guest is refused NOTE, the camera dollies into paw.'s sign-in, and after it the bay is released", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const account = await freshAccount(page, "probelocked");
  await page.goto(`${CABINET}/`);
  await page.waitForLoadState("networkidle");
  await page.locator("[data-cartridge='2']").click();
  await expect(page.locator("[data-screen]")).toHaveText("02 DENIED");
  await expect(page.locator("[data-screen-sub]")).toHaveText(
    "NEEDS VISITOR PASS",
  );
  await expect(page.locator("[data-tile='2']")).toHaveAttribute(
    "data-state",
    "denied",
  );
  await expect(page).toHaveURL(/:8787\/\?returnTo=/, { timeout: 10_000 });
  clearRateLimits();
  await view(page, "methods").locator("[data-method='password']").click();
  const form = view(page, "password");
  await form.locator('input[name="email"]').fill(account.email);
  await form.locator('input[name="password"]').fill(PROBE_PASSWORD);
  await goKey(page).click();
  await expect(page.locator("[data-tray]")).toHaveAttribute("data-tray", "2", {
    timeout: 30_000,
  });
  await expect(page.locator("[data-cabinet-state]")).toHaveText("VISITOR MODE");
});

test.describe("codes typed on paw.'s keypad", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(() => {
    clearRateLimits();
  });

  test("a rejected code says so, and a new code can be typed at once", async ({
    page,
  }) => {
    await reachCode(page);
    await typeCode(page, "12345");
    await expect(page.locator("[data-screen]")).toHaveText("EMAIL CODE 5/6");
    await page.locator("[data-key='6']").click();
    await goKey(page).click();
    await expect(page.locator("[data-screen]")).toHaveText("CODE REJECTED");
    await expect(page.locator("[data-screen-sub]")).toContainText("TRIES LEFT");
    await page.locator("[data-key='7']").click();
    await expect(page.locator("[data-screen]")).toHaveText("EMAIL CODE 1/6");
  });

  test("signing in while the estate is down says so, it does not stop at PASS ACCEPTED", async ({
    page,
  }) => {
    await acceptCode(page, { email: "probe@example.com", username: "probe" });
    await page.route("**/api/estate", (route) =>
      route.fulfill({ status: 500, body: "{}" }),
    );
    await signInFromCabinet(page);
    await reachCode(page);
    await typeCode(page, "123456");
    await goKey(page).click();
    await expect(page.locator("[data-cabinet-state]")).toHaveText(
      "VISITOR MODE",
      { timeout: 30_000 },
    );
    await expect(page.locator("[data-screen]")).toHaveText("ESTATE UNREADABLE");
  });

  test("a dropped packet during verify keeps the code, it does not end the sign-in", async ({
    page,
  }) => {
    await reachCode(page);
    await page.route("**/api/auth/otp/verify", (route) => route.abort());
    await typeCode(page, "123456");
    await goKey(page).click();
    const error = view(page, "code").locator("[data-say]");
    await expect(error).toContainText(/could not tell/i);
    await expect(
      error,
      "the machine cannot know the code survived, so it must not promise it",
    ).not.toContainText(/still good/i);
    await expect(page.locator("[data-machine]")).toHaveAttribute(
      "data-view",
      "code",
    );
    await expect(page.locator("[data-screen]")).toHaveText("EMAIL CODE 6/6");

    let verifies = 0;
    await page.unroute("**/api/auth/otp/verify");
    await page.route("**/api/auth/otp/verify", async (route) => {
      verifies += 1;
      await route.continue();
    });
    await goKey(page).click();
    await expect(page.locator("[data-screen]")).toHaveText("CODE REJECTED");
    expect(verifies).toBe(1);
  });

  test("the machine greets a code sign-in by name, not as a generic account", async ({
    page,
  }) => {
    await acceptCode(page, {
      email: "namedprobe@example.com",
      username: "namedprobe",
    });
    await signInFromCabinet(page);
    await reachCode(page);
    await typeCode(page, "123456");
    await goKey(page).click();
    await expect(page.locator("[data-cabinet-state]")).toHaveText(
      "VISITOR MODE",
      { timeout: 30_000 },
    );
    await expect(page.locator("[data-account-name]")).toHaveText("namedprobe");
    await expect(page.locator("[data-greeting]")).toHaveText(
      "HI, NAMEDPROBE · VISITOR",
    );
  });

  test("a code sign-in with no username lands on paw.'s welcome step, still holding the way back", async ({
    page,
  }) => {
    await acceptCode(page, { email: "setupprobe@example.com", username: null });
    await signInFromCabinet(page);
    await reachCode(page);
    await typeCode(page, "123456");
    await goKey(page).click();
    await expect(view(page, "welcome")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/:8787\/\?returnTo=/);
  });

  test("a lost answer to a checked code is settled against the session", async ({
    page,
  }) => {
    await signInFromCabinet(page);
    await reachCode(page);
    await page.route("**/api/auth/otp/verify", (route) => route.abort());
    await page.route("**/api/session", (route) =>
      route.fulfill({
        json: sessionOf({
          email: "lostanswer@example.com",
          username: "lostanswer",
        }),
      }),
    );
    await typeCode(page, "123456");
    await goKey(page).click();
    await expect(page.locator("[data-cabinet-state]")).toHaveText(
      "VISITOR MODE",
      { timeout: 30_000 },
    );
  });

  test("a new account keeps the bay it asked for on the way to welcome", async ({
    page,
  }) => {
    await acceptCode(page, { email: "keptbay@example.com", username: null });
    await page.goto(CABINET);
    await page.waitForLoadState("networkidle");
    await page.locator("[data-cartridge='2']").click();
    await expect(view(page, "methods")).toBeVisible({ timeout: 20_000 });
    await reachCode(page);
    await typeCode(page, "123456");
    await goKey(page).click();
    await expect(view(page, "welcome")).toBeVisible({ timeout: 20_000 });
    await page.route(`${CABINET}/probe-storage`, (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>probe</p>" }),
    );
    await page.goto(`${CABINET}/probe-storage`);
    expect(
      await page.evaluate(() => sessionStorage.getItem("pawl:machine-request")),
    ).toBe("2");
  });

  test("‹ Email steps back to the email, and the next code starts empty", async ({
    page,
  }) => {
    const email = await reachCode(page);
    await typeCode(page, "123");
    await page.getByRole("button", { name: "‹ Email" }).click();
    const field = view(page, "email").locator("#code-email");
    await expect(field).toHaveValue(email);
    await expect(field).toBeFocused();
    await view(page, "email")
      .getByRole("button", { name: "Send code" })
      .click();
    await expect(view(page, "code")).toBeVisible();
    await page.locator("[data-key='4']").click();
    await expect(page.locator("[data-screen]")).toHaveText("EMAIL CODE 1/6");
  });

  test("a key is lit only when it does something on the screen it serves", async ({
    page,
  }) => {
    await page.goto(`${PASS}/`);
    await expect(view(page, "methods")).toBeVisible();
    const emailKey = await view(page, "methods")
      .locator("[data-method='email']")
      .getAttribute("aria-keyshortcuts");
    await expect(page.locator(`[data-key='${emailKey}']`)).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    await expect(page.locator("[data-key='9']")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.locator("[data-key='CLR']")).toBeDisabled();
    await expect(goKey(page)).toBeDisabled();

    await page.locator(`[data-key='${emailKey}']`).click();
    await expect(view(page, "email")).toBeVisible();
    await expect(view(page, "email").locator("#code-email")).toBeFocused();
    await expect(page.locator(`[data-key='${emailKey}']`)).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(goKey(page)).toBeEnabled();
    await expect(page.locator("[data-key='CLR']")).toBeEnabled();

    await view(page, "email")
      .locator("#code-email")
      .fill(`goprobe-${Date.now().toString().slice(-6)}@example.com`);
    await goKey(page).click();
    await expect(view(page, "code")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-key='0']")).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  test("the keyboard's digits and Backspace work the screen even while a choice has focus", async ({
    page,
  }) => {
    await page.route("**/api/auth/otp/start", (route) =>
      route.fulfill({ json: { ok: true } }),
    );
    await page.goto(`${PASS}/`);
    const choice = view(page, "methods").locator("[data-method='email']");
    await expect(
      view(page, "methods").locator("[data-method]").first(),
    ).toBeFocused();
    await page.keyboard.press(
      (await choice.getAttribute("aria-keyshortcuts"))!,
    );
    await expect(view(page, "email")).toBeVisible();
    await view(page, "email").locator("#code-email").fill("keys@example.com");
    await view(page, "email")
      .getByRole("button", { name: "Send code" })
      .click();
    await expect(view(page, "code")).toBeVisible();
    await page.keyboard.press("1");
    await page.keyboard.press("2");
    await expect(page.locator("[data-screen]")).toHaveText("EMAIL CODE 2/6");
    await page.keyboard.press("Backspace");
    await expect(page.locator("[data-screen]")).toHaveText("EMAIL CODE 1/6");
  });

  test("GO pressed twice sends one email, and CLR mid-send says nothing false", async ({
    page,
  }) => {
    let starts = 0;
    await page.route("**/api/auth/otp/start", async (route) => {
      starts += 1;
      await new Promise((settled) => setTimeout(settled, 1200));
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`${PASS}/`);
    await view(page, "methods").locator("[data-method='email']").click();
    await view(page, "email").locator("#code-email").fill("twice@example.com");
    const send = view(page, "email").getByRole("button", { name: "Send code" });
    await send.click();
    await send.click({ force: true });
    await page.locator("[data-key='CLR']").click({ force: true });
    await page.waitForTimeout(1600);
    expect(starts).toBe(1);
    await expect(view(page, "code")).toBeVisible();
    await expect(view(page, "email").locator("[data-say]")).toHaveText("");
  });

  test("a second code cannot race the first one being checked", async ({
    page,
  }) => {
    await reachCode(page);
    let verifies = 0;
    await page.route("**/api/auth/otp/verify", async (route) => {
      verifies += 1;
      await new Promise((settled) => setTimeout(settled, 1500));
      await route.fulfill({
        status: 401,
        json: {
          code: "invalid_code",
          message: "That code is incorrect.",
          attemptsLeft: 4,
        },
      });
    });
    await typeCode(page, "123456");
    await goKey(page).click();
    await page.locator("[data-key='CLR']").click({ force: true });
    await goKey(page).click({ force: true });
    await expect(page.locator("[data-screen]")).toHaveText("CODE REJECTED", {
      timeout: 10_000,
    });
    expect(verifies).toBe(1);
  });
});

test("devices page three at a time on paw.", async ({ page }) => {
  const user = {
    id: "u1",
    email: "ana@example.com",
    username: "ana_01",
    role: "USER",
  };
  const sessions = Array.from({ length: 7 }, (_, index) => ({
    id: `s${index}`,
    userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0",
    ip: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    current: index === 0,
  }));
  await page.route(`${PASS}/api/session`, (route) =>
    route.fulfill({ json: { authenticated: true, user } }),
  );
  await page.route(`${PASS}/api/account`, (route) =>
    route.fulfill({ json: { user, providers: ["password"] } }),
  );
  await page.route(`${PASS}/api/sessions`, (route) =>
    route.fulfill({ json: { sessions } }),
  );
  await page.route(`${PASS}/api/account/grants`, (route) =>
    route.fulfill({ json: { grants: [] } }),
  );
  await page.goto(`${PASS}/`);
  await expect(view(page, "account")).toBeVisible();
  await page.keyboard.press("2");
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await expect(view(page, "devices").locator("li")).toHaveCount(3);
  await page.getByRole("button", { name: "Next ›" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Page 3 of 3")).toBeVisible();
  await expect(view(page, "devices").locator("li")).toHaveCount(1);
  await page.keyboard.press("Backspace");
  await expect(view(page, "account")).toBeVisible();
});
