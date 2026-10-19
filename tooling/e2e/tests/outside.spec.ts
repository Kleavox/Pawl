import { expect, test, type Page } from "@playwright/test";

import {
  freshAccount,
  goKey,
  passSql,
  signIn,
  view,
  type PassAccount,
} from "./pass-account";

const PROVIDER = "http://127.0.0.1:8787";
const CABINET = "http://127.0.0.1:8786";
const MONITOR = "http://127.0.0.1:8792";

async function register(page: Page): Promise<{ secret: string }> {
  await view(page, "account")
    .getByRole("button", { name: "Registered apps" })
    .click();
  await expect(view(page, "registry")).toBeVisible();
  await view(page, "registry").getByRole("button", { name: "New app" }).click();
  await view(page, "registry-name").getByLabel("Name").fill("Monitor");
  await view(page, "registry-name").getByLabel("Address").fill(MONITOR);
  await goKey(page).click();
  await expect(
    view(page, "registry-label").getByLabel("Label on the cartridge"),
  ).toHaveValue("monitor");
  await goKey(page).click();
  await expect(
    view(page, "registry-return").getByLabel("Return address"),
  ).toHaveValue(`${MONITOR}/auth/callback`);
  await goKey(page).click();
  const secretView = view(page, "registry-secret");
  await expect(secretView).toBeVisible({ timeout: 20_000 });
  const values = await secretView.locator("dd span").allTextContents();
  expect(values[0]).toBe("monitor");
  return { secret: values[1] ?? "" };
}

async function takeMonitor(page: Page): Promise<void> {
  const tile = page.locator("[data-tile]", { hasText: "MONITOR" });
  await expect(tile).toBeVisible({ timeout: 20_000 });
  await tile.locator("[data-cartridge]").click();
  await expect(page.locator("[data-tray]")).not.toHaveAttribute(
    "data-tray",
    "none",
    { timeout: 10_000 },
  );
  await page.locator("[data-tray-action]").click();
  await expect(page.locator("[data-receipt-sheet]")).toHaveAttribute(
    "data-stage",
    "hand",
    { timeout: 20_000 },
  );
}

test("an admin registers an outside app; a person connects it on the cabinet, reads its card and goes on", async ({
  page,
}) => {
  test.setTimeout(240_000);
  let admin: PassAccount | null = null;
  try {
    admin = await freshAccount(page, "probeoutside", "ADMIN");
    await signIn(page, admin, PROVIDER);
    const { secret } = await register(page);

    await page.goto(`${CABINET}/`);
    await takeMonitor(page);
    const card = page.locator("[data-receipt]");
    await expect(
      card.getByRole("heading", { name: "Monitor needs to know who you are" }),
    ).toBeVisible({ timeout: 20_000 });
    await card.getByRole("link", { name: /Connect/ }).click();
    await expect(page.locator("[data-screen]")).toHaveText(
      "AN APP WANTS YOUR PASS",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Allow" }).click();

    await expect(page).toHaveURL(new RegExp(`^${CABINET}/`), {
      timeout: 20_000,
    });
    await expect(page.locator("[data-tray-action]")).toBeVisible({
      timeout: 20_000,
    });
    await page.locator("[data-tray-action]").click();
    await expect(
      card.getByRole("heading", { name: "Monitor card" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText(`Hello ${admin.email}`);
    const subject =
      (await card.locator("[data-card-value]").textContent()) ?? "";
    expect(subject.length).toBeGreaterThan(20);

    const asked = await page.request.post(`${PROVIDER}/oauth/subjects`, {
      headers: {
        authorization: `Basic ${Buffer.from(`monitor:${secret}`).toString("base64")}`,
        "content-type": "application/json",
      },
      data: { subjects: [subject, "made-up"] },
    });
    expect(await asked.json()).toEqual({ live: [subject] });

    await card.getByRole("link", { name: /Detail/ }).click();
    await expect(page).toHaveURL(`${MONITOR}/`, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "monitor" })).toBeVisible();
  } finally {
    passSql("DELETE FROM oauth_clients WHERE id = 'monitor'");
  }
});
