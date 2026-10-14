import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { localWorkerOrigin } from "@pawl/topology";

import { goKey, openSection, submitPassword, view } from "./pass-account";

const GATEWAY = localWorkerOrigin("gateway", "localhost");
const PASS = localWorkerOrigin("pass", "localhost");
const NOTES = "http://localhost:8790";

const email = `e2e-${Date.now()}@example.com`;
const password = "playwright-password-1";

function markEmailVerified(address: string): void {
  execSync(
    `pnpm exec wrangler d1 execute local-pawl --local --command "UPDATE users SET email_verified_at = datetime('now') WHERE email = '${address}'"`,
    {
      cwd: path.join(
        fileURLToPath(new URL("../../../", import.meta.url)),
        "worker",
      ),
      stdio: "pipe",
    },
  );
}

test("web home loads through the gateway", async ({ page }) => {
  await page.goto(`${GATEWAY}/`);
  await expect(page.locator(".marquee__brand")).toHaveText("FIXTURE");
  await expect(page.locator("[data-sign-in]")).toBeVisible();
});

test("no horizontal overflow at 320px or 360px", async ({ browser }) => {
  for (const width of [320, 360]) {
    const context = await browser.newContext({
      viewport: { width, height: 740 },
    });
    const page = await context.newPage();
    for (const url of [
      `${GATEWAY}/`,
      `${GATEWAY}/privacy.html`,
      `${GATEWAY}/terms.html`,
      `${NOTES}/`,
      `${PASS}/`,
    ]) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${url} at ${width}px`).toBeLessThanOrEqual(0);
      const past = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("body *")]
          .filter((element) => {
            if (element.closest(".marquee__ticker")) return false;
            if (element.closest(".camera:not([data-framing='whole'])")) {
              return false;
            }
            const box = element.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) return false;
            if (getComputedStyle(element).visibility === "hidden") return false;
            return box.right > innerWidth + 0.5 || box.left < -0.5;
          })
          .map((element) => `${element.tagName}.${element.className}`),
      );
      expect(past, `clipped at ${url}, ${width}px`).toEqual([]);
    }
    await context.close();
  }
});

test("auth journey: register, sign in, account page", async ({ page }) => {
  await page.goto(`${PASS}/`);
  await view(page, "methods")
    .getByRole("button", { name: "Create one" })
    .click();
  const who = view(page, "register");
  await who.locator('input[name="username"]').fill("e2e_user");
  await who.locator('input[name="email"]').fill(email);
  await goKey(page).click();
  const key = view(page, "register-key");
  await key.locator('input[name="password"]').fill(password);
  await key.locator('input[name="confirm-password"]').fill(password);
  await goKey(page).click();
  await expect(view(page, "sent")).toBeVisible();

  markEmailVerified(email);

  await submitPassword(page, PASS, email, password);
  await expect(
    view(page, "account").getByRole("heading", { name: "e2e_user" }),
  ).toBeVisible();
  await openSection(page, "Profile");
  await expect(view(page, "profile").getByText("Sign-in")).toBeVisible();
  await expect(
    view(page, "profile").locator("dd span", { hasText: "Password" }),
  ).toBeVisible();
});
