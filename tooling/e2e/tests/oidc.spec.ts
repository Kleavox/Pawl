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

async function partSizes(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-part]")].map((node) => [
        node.dataset.part!,
        `${node.offsetWidth}x${node.offsetHeight}`,
      ]),
    ),
  );
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

const SAME_SITE_RP = "http://127.0.0.1:8790";

test("a person signed in at Pawl arrives signed in at a relying party, without a page in between", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const account = await freshAccount(page, "probesilent");
  await signInAtProvider(page, account);
  await page.goto(`${RELYING_PARTY}/login?prompt=none`);
  await expect(
    page.getByRole("heading", { name: `signed in as ${account.user}` }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-role]")).toHaveText("USER");
});

test("a guest asked silently comes back a guest, not to a sign-in page", async ({
  page,
}) => {
  await page.goto(`${RELYING_PARTY}/login?prompt=none`);
  await expect(page.locator("[data-error]")).toHaveText("login_required");
});

test("signing out at a relying party ends the Pawl session", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const account = await freshAccount(page, "probeout");
  await signInAtProvider(page, account);
  await page.goto(`${SAME_SITE_RP}/signout`);
  await page.getByRole("button", { name: "sign out" }).click();
  await expect(page).toHaveURL(`${SAME_SITE_RP}/`);
  await page.goto(`${SAME_SITE_RP}/login?prompt=none`);
  await expect(page.locator("[data-error]")).toHaveText("login_required");
});

const THIRD_PARTY = "http://127.0.0.1:8791";

test("a person connects a third-party app, finds it in their account, and disconnects it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const account = await freshAccount(page, "probeconnect");
  await signInAtProvider(page, account);
  await page.goto(`${CABINET}/`);
  const cabinet = await partSizes(page);
  await page.goto(`${THIRD_PARTY}/login`);
  await expect(page.locator("[data-screen]")).toHaveText(
    "AN APP WANTS YOUR PASS",
  );
  expect(
    await partSizes(page),
    "the consent page draws the same machine as the cabinet",
  ).toEqual(cabinet);
  await expect(page.locator("[data-camera]")).toHaveAttribute(
    "data-framing",
    "screen",
  );
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(
    page.getByRole("heading", { name: `signed in as ${account.user}` }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.locator("[data-role]"),
    "a third-party access token says nothing about the person's role",
  ).toHaveText("undefined");

  await page.goto(`${PROVIDER}/`);
  await page.getByRole("tab", { name: "Apps" }).click();
  const disconnect = page.getByRole("button", { name: "Disconnect Docs" });
  await expect(disconnect).toBeVisible({ timeout: 20_000 });
  await disconnect.click();
  await expect(disconnect).toBeHidden();

  await page.goto(`${THIRD_PARTY}/login?prompt=none`);
  await expect(page.locator("[data-error]")).toHaveText("consent_required");
});

const CABINET = "http://127.0.0.1:8786";

test("the cabinet trusts only its own session, and gets one from Pawl without a page in between", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const account = await freshAccount(page, "probecabinet");
  await signInAtProvider(page, account);
  const asked = await page.request.get(`${CABINET}/api/session`);
  expect(
    await asked.json(),
    "the Pawl cookie alone must not sign anyone in at the gateway",
  ).toEqual({ authenticated: false });
  await page.goto(`${CABINET}/`);
  await expect(page.locator("[data-account-name]")).toHaveText(account.user, {
    timeout: 20_000,
  });
});

const BEHIND_ITS_OWN_LOGIN = "http://localhost:8792";

test("an app behind its own login, as Cloudflare Access is, signs a person in with a client secret", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const account = await freshAccount(page, "probeaccess");
  await signInAtProvider(page, account);
  await page.goto(`${BEHIND_ITS_OWN_LOGIN}/login`);
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(
    page.getByRole("heading", { name: `signed in as ${account.user}` }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-aud]")).toHaveText("fixture-monitor");
  await expect(page.locator("[data-email]")).toHaveText(account.email);
});
