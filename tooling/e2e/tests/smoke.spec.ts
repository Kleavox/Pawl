import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { localWorkerOrigin } from "@pawl/topology";

const GATEWAY = localWorkerOrigin("gateway", "localhost");
const PASS = localWorkerOrigin("pass", "localhost");
const NOTES = "http://localhost:8790";

const email = `e2e-${Date.now()}@example.com`;
const password = "playwright-password-1";

function markEmailVerified(address: string): void {
  execSync(
    `pnpm exec wrangler d1 execute local-pass --local --command "UPDATE users SET email_verified_at = datetime('now') WHERE email = '${address}'"`,
    {
      cwd: path.join(
        fileURLToPath(new URL("../../../", import.meta.url)),
        "workers",
        "pass",
      ),
      stdio: "pipe",
    },
  );
}

test("web home loads through the gateway", async ({ page }) => {
  await page.goto(`${GATEWAY}/`);
  await expect(page.locator(".pw-brand")).toContainText("fixture");
  await expect(page.locator("[data-signin]")).toBeVisible();
});

test("no horizontal overflow at 320px or 360px", async ({ browser }) => {
  for (const width of [320, 360]) {
    const context = await browser.newContext({
      viewport: { width, height: 740 },
    });
    const page = await context.newPage();
    for (const url of [`${GATEWAY}/`, `${NOTES}/`, `${PASS}/`]) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${url} at ${width}px`).toBeLessThanOrEqual(0);
    }
    await context.close();
  }
});

test("auth journey: register, sign in, account page", async ({ page }) => {
  await page.goto(`${PASS}/`);
  await page.getByRole("button", { name: "Create an account" }).click();

  await page.locator('input[name="username"]').fill("e2e_user");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm-password"]').fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByText("Check your email")).toBeVisible();

  markEmailVerified(email);

  await page.goto(`${PASS}/`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByRole("heading", { name: "e2e_user" })).toBeVisible();
  await expect(page.getByText("Sign-in methods")).toBeVisible();
  await expect(
    page.locator(".providers span", { hasText: "Password" }),
  ).toBeVisible();
});
