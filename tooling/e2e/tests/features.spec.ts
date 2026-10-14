import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { localWorkerOrigin } from "@pawl/topology";

import {
  clearRateLimits,
  freshAccount,
  goKey,
  openSection,
  passQuery,
  passSql,
  PROBE_PASSWORD,
  submitPassword,
  view,
} from "./pass-account";

const PASS = localWorkerOrigin("pass", "localhost");
const GATEWAY = localWorkerOrigin("gateway", "localhost");

const run = Date.now().toString().slice(-6);
const admin = { user: "probeops", email: "probeops@example.com" };

let context: BrowserContext;
let page: Page;
let problems: string[] = [];
let expectFailure = false;

const passDir = path.join(
  fileURLToPath(new URL("../../../", import.meta.url)),
  "worker",
);

async function attempt(): Promise<string | null> {
  await submitPassword(page, PASS, admin.email, PROBE_PASSWORD);
  const landed = view(page, "account").getByRole("heading", {
    name: admin.user,
  });
  const failed = view(page, "password").locator("[data-say]:not(:empty)");
  await expect(landed.or(failed)).toBeVisible({ timeout: 20000 });
  if (await landed.isVisible()) return null;
  return (await failed.textContent()) ?? "sign-in failed with no message";
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();
  problems = [];
  page.on("console", (message) => {
    if (expectFailure) return;
    if (message.type() === "error") problems.push("console: " + message.text());
  });
  page.on("pageerror", (error) => problems.push("pageerror: " + error.message));
  page.on("response", (response) => {
    if (expectFailure) return;
    if (response.status() >= 400 && response.url().includes("/api/")) {
      problems.push(response.status() + " " + response.url());
    }
  });

  const first = await attempt();
  if (first === null) return;
  if (!/incorrect|not found|no account|invalid/i.test(first)) {
    throw new Error(
      `Cannot sign the probe account in, and this is not a missing account: "${first}". ` +
        `Clear the local limiter with: pnpm exec wrangler kv key list --binding SESSIONS --local`,
    );
  }

  await page.goto(`${PASS}/`);
  await view(page, "methods")
    .getByRole("button", { name: "Create one" })
    .click();
  const who = view(page, "register");
  await who.locator('input[name="username"]').fill(admin.user);
  await who.locator('input[name="email"]').fill(admin.email);
  await goKey(page).click();
  const key = view(page, "register-key");
  await key.locator('input[name="password"]').fill(PROBE_PASSWORD);
  await key.locator('input[name="confirm-password"]').fill(PROBE_PASSWORD);
  await goKey(page).click();
  await expect(view(page, "sent")).toBeVisible({ timeout: 20000 });
  passSql(
    `UPDATE users SET email_verified_at = datetime('now'), role = 'ADMIN' WHERE email = '${admin.email}'`,
  );
  expect(await attempt()).toBeNull();
  problems.length = 0;
});

test.afterAll(async () => {
  await context?.close();
});

test("every placeholder is readable against what sits behind it", async () => {
  const guest = await context.browser()!.newContext();
  const guestPage = await guest.newPage();
  const failures: string[] = [];

  const visits = [
    ["pass account", `${PASS}/`, page],
    ["pass signed out", `${PASS}/`, guestPage],
  ] as const;

  for (const [label, url, target] of visits) {
    await target.goto(url);
    const weak = await target.evaluate(() => {
      const parse = (value: string) => {
        const m = value.match(
          /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
        );
        if (!m) return null;
        return [
          Number(m[1]),
          Number(m[2]),
          Number(m[3]),
          m[4] === undefined ? 1 : Number(m[4]),
        ] as const;
      };
      const luminance = (rgb: readonly number[]) =>
        [rgb[0]!, rgb[1]!, rgb[2]!]
          .map((v) => {
            const c = v / 255;
            return c <= 0.03928
              ? c / 12.92
              : Math.pow((c + 0.055) / 1.055, 2.4);
          })
          .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i]!, 0);
      const contrast = (a: readonly number[], b: readonly number[]) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi! + 0.05) / (lo! + 0.05);
      };
      const ground = (el: Element): readonly number[] => {
        let node: Element | null = el;
        while (node && node !== document.documentElement) {
          const bg = parse(getComputedStyle(node).backgroundColor);
          if (bg && bg[3] > 0.5) return bg;
          node = node.parentElement;
        }
        return [7, 9, 8, 1];
      };
      const out: string[] = [];
      for (const el of document.querySelectorAll("input, textarea")) {
        const placeholder = el.getAttribute("placeholder");
        if (!placeholder) continue;
        const style = getComputedStyle(el, "::placeholder");
        const fg = parse(style.color);
        if (!fg) continue;
        const ratio = contrast(fg, ground(el)) * Number(style.opacity || 1);
        if (ratio < 4.5) {
          out.push(`"${placeholder}" ${ratio.toFixed(2)}:1 ${style.color}`);
        }
      }
      return out;
    });
    failures.push(...weak.map((entry) => `${label}: ${entry}`));
  }
  await guest.close();
  expect(failures).toEqual([]);
});

test("pass: the account page lists devices and can revoke one", async () => {
  await page.goto(`${PASS}/`);
  await expect(
    view(page, "account").getByRole("heading", { name: admin.user }),
  ).toBeVisible();
  await openSection(page, "Devices");
  const devices = view(page, "devices");
  await expect(devices.getByRole("heading", { name: "Devices" })).toBeVisible();

  const revokable = devices.getByRole("button", { name: /^Revoke / });
  await expect(devices.locator("[data-device-row]").first()).toBeVisible({
    timeout: 20000,
  });
  if ((await revokable.count()) > 0) {
    const label = (await revokable.first().getAttribute("aria-label"))!;
    const which = label.slice(label.indexOf(":"));
    await revokable.first().click();
    await expect(devices.getByText("Device signed out.")).toBeVisible({
      timeout: 20000,
    });
    await expect(devices.locator(`button[aria-label$="${which}"]`)).toHaveCount(
      0,
    );
  }
});

test("pass: every session control says which device it acts on", async () => {
  await page.goto(`${PASS}/`);
  await openSection(page, "Devices");
  const rows = view(page, "devices").locator("[data-device-row]");
  await expect(rows.first()).toBeVisible({ timeout: 20000 });
  const names = await rows
    .locator("button")
    .evaluateAll((nodes) =>
      nodes.map(
        (node) => node.getAttribute("aria-label") || node.textContent || "",
      ),
    );
  expect(names.length).toBeGreaterThan(0);
  expect(new Set(names).size).toBe(names.length);
});

test("pass: the username can be changed and changed back", async () => {
  await page.goto(`${PASS}/`);
  await openSection(page, "Profile");
  const profile = view(page, "profile");
  const rename = async (name: string) => {
    await profile.getByRole("button", { name: "Edit username" }).click();
    await view(page, "profile-name")
      .locator('input[name="username"]')
      .fill(name);
    await view(page, "profile-name")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(profile.getByText("Username updated.")).toBeVisible({
      timeout: 20000,
    });
    await expect(profile.getByText(name, { exact: true })).toBeVisible();
  };
  await rename(`${admin.user}x`);
  await rename(admin.user);
});

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

async function hashOf(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return base64Url(new Uint8Array(digest));
}

async function mintToken(
  email: string,
  purpose: "EMAIL" | "PASSWORD_RESET",
): Promise<string> {
  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await hashOf(token);

  passSql(
    `INSERT INTO verification_tokens (id, user_id, purpose, token_hash, expires_at) ` +
      `SELECT '${purpose}-${run}-${Date.now()}', id, '${purpose}', '${hash}', ` +
      `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 minutes') ` +
      `FROM users WHERE email = '${email}'`,
  );
  return token;
}

async function mintOtp(email: string, code: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const key = `otp:${await hashOf(normalized)}`;
  const codeHash = await hashOf(`${normalized}:${code}`);
  passSql(
    `INSERT INTO otp_codes (key, code_hash, attempts, expires_at) ` +
      `VALUES ('${key}', '${codeHash}', 0, ${Date.now() + 600_000}) ` +
      `ON CONFLICT(key) DO UPDATE SET code_hash = excluded.code_hash, ` +
      `attempts = 0, expires_at = excluded.expires_at`,
  );
}

test("pass: an emailed verification token activates the account", async () => {
  test.setTimeout(180_000);
  const fresh = await context.browser()!.newContext();
  const worker = await fresh.newPage();
  const account = await freshAccount(worker, "probeverify");
  passSql(
    `UPDATE users SET email_verified_at = NULL WHERE email = '${account.email}'`,
  );
  const token = await mintToken(account.email, "EMAIL");

  await worker.goto(`${PASS}/verify?token=${encodeURIComponent(token)}`);
  await expect(
    view(worker, "verify").getByRole("heading", { name: "Email verified" }),
  ).toBeVisible({ timeout: 20000 });

  await submitPassword(worker, PASS, account.email, PROBE_PASSWORD);
  await expect(
    view(worker, "account").getByRole("heading", { name: account.user }),
  ).toBeVisible({ timeout: 20000 });
  await fresh.close();
});

test("pass: a password reset token sets a new password", async () => {
  test.setTimeout(180_000);
  const fresh = await context.browser()!.newContext();
  const worker = await fresh.newPage();
  const account = await freshAccount(worker, "probereset");
  const token = await mintToken(account.email, "PASSWORD_RESET");
  const nextPassword = "probe-password-2";

  await worker.goto(`${PASS}/reset?token=${encodeURIComponent(token)}`);
  const field = view(worker, "reset").locator('input[name="password"]');
  await expect(field).toBeVisible({ timeout: 20000 });
  await field.fill(nextPassword);
  await goKey(worker).click();
  await expect(
    worker.getByRole("link", { name: "Return to sign in" }),
  ).toBeVisible({ timeout: 20000 });

  clearRateLimits();
  await submitPassword(worker, PASS, account.email, nextPassword);
  await expect(
    view(worker, "account").getByRole("heading", { name: account.user }),
  ).toBeVisible({ timeout: 20000 });
  await fresh.close();
});

test("otp: an unknown email becomes an account that still needs setup", async () => {
  test.setTimeout(180_000);
  clearRateLimits();
  const email = `otp-new-${run}@example.com`;
  const fresh = await context.browser()!.newContext();
  const worker = await fresh.newPage();

  await worker.goto(GATEWAY);
  await mintOtp(email, "246810");

  const response = await worker.request.post(`${PASS}/api/auth/otp/verify`, {
    headers: { origin: GATEWAY },
    data: { email, code: "246810" },
  });

  expect(response.status()).toBe(200);
  const minted = response.headers()["set-cookie"] ?? "";
  expect(minted).toContain("__Secure-pawl_session=");
  expect(
    minted,
    "locally every origin shares the host localhost and cookies ignore port, " +
      "so host-only is correct here; a Domain would be one the browser refuses",
  ).not.toContain("Domain=");
  expect(await response.json()).toMatchObject({
    authenticated: true,
    needsSetup: true,
  });

  passSql(`DELETE FROM users WHERE email = '${email}'`);
  await fresh.close();
});

test("otp: wrong codes sent together each cost their own attempt", async () => {
  test.setTimeout(180_000);
  clearRateLimits();
  const email = `otp-burst-${run}@example.com`;
  const fresh = await context.browser()!.newContext();
  const worker = await fresh.newPage();

  await worker.goto(GATEWAY);
  await mintOtp(email, "135790");

  const answers = await Promise.all(
    Array.from({ length: 9 }, () =>
      worker.request.post(`${PASS}/api/auth/otp/verify`, {
        headers: { origin: GATEWAY },
        data: { email, code: "000000" },
      }),
    ),
  );
  const bodies = (await Promise.all(
    answers.map((answer) => answer.json()),
  )) as Array<{ attemptsLeft?: number }>;
  const counted = bodies
    .map((body) => body.attemptsLeft)
    .filter((left): left is number => typeof left === "number")
    .sort();

  expect(
    counted,
    "a counter read before the write would tell every caller the same number",
  ).toEqual([1, 2, 3, 4]);

  const afterwards = await worker.request.post(`${PASS}/api/auth/otp/verify`, {
    headers: { origin: GATEWAY },
    data: { email, code: "135790" },
  });
  expect(afterwards.status()).toBe(401);
  await expect(afterwards.json()).resolves.toMatchObject({
    code: "too_many_attempts",
  });

  await fresh.close();
});

test("otp: a disabled account is refused after the code is accepted", async () => {
  test.setTimeout(180_000);
  clearRateLimits();
  const fresh = await context.browser()!.newContext();
  const worker = await fresh.newPage();
  const account = await freshAccount(worker, "otpoff");

  passSql(
    `UPDATE users SET disabled_at = datetime('now') WHERE email = '${account.email}'`,
  );
  await mintOtp(account.email, "135791");

  const response = await worker.request.post(`${PASS}/api/auth/otp/verify`, {
    headers: { origin: GATEWAY },
    data: { email: account.email, code: "135791" },
  });

  expect(response.status()).toBe(403);
  expect(JSON.stringify(await response.json())).toMatch(/disabled/i);

  await fresh.close();
});

test("pass: an account can delete itself", async () => {
  test.setTimeout(180_000);
  const fresh = await context.browser()!.newContext();
  const worker = await fresh.newPage();
  const account = await freshAccount(worker, "probegone");
  const accountId = String(
    passQuery(`SELECT id FROM users WHERE email = '${account.email}'`)[0]?.id,
  );
  clearRateLimits();
  await submitPassword(worker, PASS, account.email, PROBE_PASSWORD);
  await expect(
    view(worker, "account").getByRole("heading", { name: account.user }),
  ).toBeVisible({ timeout: 20000 });

  await openSection(worker, "Security");
  await view(worker, "security")
    .getByRole("button", { name: "Delete this account" })
    .click();
  const confirm = view(worker, "delete").locator(
    'input[name="confirm-delete-email"]',
  );
  await expect(confirm).toBeVisible({ timeout: 20000 });
  await confirm.fill(account.email);
  await view(worker, "delete")
    .getByRole("button", { name: "Delete forever" })
    .click();
  await expect(view(worker, "methods")).toBeVisible({ timeout: 20000 });
  const purged = (await (
    await worker.request.get("http://127.0.0.1:8790/fixture/purged")
  ).json()) as string[];
  expect(purged).toContain(accountId);

  clearRateLimits();
  await submitPassword(worker, PASS, account.email, PROBE_PASSWORD);
  await expect(
    view(worker, "password").locator("[data-say]:not(:empty)"),
  ).toBeVisible({ timeout: 20000 });
  await fresh.close();
});

test("the account origin is the same machine, seen close up", async () => {
  await page.goto(PASS);
  await expect(page.locator("[data-camera]")).toBeVisible();
  await expect(page.locator("header, footer")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Service panel" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy" })).toHaveAttribute(
    "href",
    /\/privacy\.html$/,
  );
  for (const lit of ["1", "2", "3", "4"]) {
    await expect(page.locator(`[data-key='${lit}']`)).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  }
  for (const dark of ["0", "5", "6", "7", "8", "9"]) {
    await expect(page.locator(`[data-key='${dark}']`)).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  }
  await expect(page.locator("[data-camera]")).toHaveAttribute(
    "data-framing",
    "screen",
  );
  await expect(page.locator("[data-part]")).toHaveCount(16);
  await expect(page.locator(".pawl-card, [data-reader]")).toHaveCount(0);
});

test("pass: the screen keeps its size across every view it shows", async ({
  browser,
}) => {
  const size = (target: Page) =>
    target
      .locator(".display")
      .evaluate(
        (node: HTMLElement) => `${node.offsetWidth}x${node.offsetHeight}`,
      );
  const seen = new Map<string, string>();
  const own = await context.newPage();
  await own.emulateMedia({ reducedMotion: "reduce" });
  await own.setViewportSize({ width: 1440, height: 900 });
  await own.goto(`${PASS}/`);
  for (const section of ["Profile", "Devices", "Apps", "Security"] as const) {
    await openSection(own, section);
    seen.set(section, await size(own));
    await own.locator("[data-key='CLR']").click();
    await expect(view(own, "account")).toBeVisible();
  }
  await own.close();
  const guest = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await guest.goto(`${PASS}/`);
  seen.set("sign in", await size(guest));
  await guest.goto(`${PASS}/?mode=register`);
  await expect(
    view(guest, "register").locator('input[name="username"]'),
  ).toBeVisible();
  seen.set("register", await size(guest));
  await guest.close();
  expect(new Set(seen.values()).size, [...seen].join(" | ")).toBe(1);
});

test("pass: under reduced motion the camera does not move", async ({
  browser,
}) => {
  const still = await browser.newPage({ reducedMotion: "reduce" });
  await still.goto(`${PASS}/`);
  await expect(still.locator("[data-camera]")).toBeVisible();
  expect(
    await still.locator("[data-camera]").evaluate((node) => ({
      animation: getComputedStyle(node).animationName,
      transition: getComputedStyle(node).transitionProperty,
      running: node.getAnimations().length,
      framing: (node as HTMLElement).dataset.framing,
    })),
  ).toEqual({
    animation: "none",
    transition: "none",
    running: 0,
    framing: "screen",
  });
  await still.close();
});

test("pass: a control reached by Tab is clear of the screen's fade", async ({
  browser,
}) => {
  const guest = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await guest.goto(`${PASS}/?mode=register`);
  const back = view(guest, "register").getByRole("button", {
    name: "‹ Other ways to sign in",
  });
  await expect(back).toBeVisible();
  await back.focus();
  const gap = await back.evaluate((node) => {
    const panel = node.closest("[data-view-panel]")!.getBoundingClientRect();
    return panel.bottom - node.getBoundingClientRect().bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(22);
  await guest.close();
});

test("the machine says a failed estate call out loud instead of an all-clear", async () => {
  await page.route("**/api/estate", (route) => route.fulfill({ status: 500 }));
  expectFailure = true;
  await page.goto(GATEWAY);

  const screen = page.locator("[data-screen]");
  await expect(page.locator("[data-cabinet-state]")).toHaveText("OWNER MODE");
  await expect(screen).toBeVisible();
  await expect(screen).toHaveText("ESTATE UNREADABLE");

  const read = await screen.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const onTop = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return {
      words: (node.textContent ?? "").trim(),
      covered: onTop === null || !node.contains(onTop),
      inert: node.closest("[inert]") !== null,
      muted: node.closest('[aria-hidden="true"]') !== null,
    };
  });
  expect(read).toEqual({
    words: "ESTATE UNREADABLE",
    covered: false,
    inert: false,
    muted: false,
  });

  const led = page.locator("[data-tile='2'] [data-badge]");
  await expect(led, "an unmeasured count is written --, never 0").toHaveText(
    "--",
  );
  await expect(led).toBeVisible();
  await expect(
    led,
    "a count that could not be read carries its own state, not silence",
  ).toHaveAttribute("data-severity", "unknown");
  await expect(page.locator("[data-ticker-text]")).toContainText(
    "ESTATE UNREADABLE",
  );
  await expect(page.locator("[data-ticker-text]")).toContainText("NOTE --");

  await page.unroute("**/api/estate");
  expectFailure = false;
});

test("pass: signing out actually signs you out", async () => {
  await page.goto(`${PASS}/`);
  await expect(
    view(page, "account").getByRole("heading", { name: admin.user }),
  ).toBeVisible();
  await openSection(page, "Devices");
  await view(page, "devices")
    .getByRole("button", { name: "Sign out of this device" })
    .click();
  await expect(view(page, "methods")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("[data-say]:not(:empty)")).toHaveCount(0);
});

test("no console errors, page errors, or failed API calls were seen", () => {
  expect([...new Set(problems)]).toEqual([]);
});
