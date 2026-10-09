import { expect, test, type Page } from "@playwright/test";

import { freshAccount, PROBE_PASSWORD, type PassAccount } from "./pass-account";

const PROVIDER = "http://127.0.0.1:8787";
const RELYING_PARTY = "http://localhost:8790";

async function signInAtProvider(page: Page, account: PassAccount) {
  await page.goto(`${PROVIDER}/`);
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill(PROBE_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: account.user })).toBeVisible({
    timeout: 20_000,
  });
}

test("a relying party on another host signs a person in through Pawl", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const account = await freshAccount(page, "proberp");
  await signInAtProvider(page, account);
  await page.goto(`${RELYING_PARTY}/login`);
  await expect(
    page.getByRole("heading", { name: `signed in as ${account.user}` }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-aud]")).toHaveText("fixture-notes");
});

test("a relying party learns a signed-out person must sign in, without a page in between", async ({
  page,
}) => {
  await page.goto(`${RELYING_PARTY}/login`);
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:8787\/\?returnTo=/u);
});
