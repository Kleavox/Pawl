import { execSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Locator, type Page } from "@playwright/test";
import { localWorkerOrigin } from "@pawl/topology";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const passDir = path.join(repoRoot, "worker");
const PASS = localWorkerOrigin("pass", "localhost");

export const PROBE_PASSWORD = "probe-password-1";

export type PassAccount = { user: string; email: string };

export function passSql(command: string): void {
  execSync(
    `pnpm exec wrangler d1 execute local-pawl --local --command "${command}"`,
    { cwd: passDir, stdio: "pipe" },
  );
}

export function passQuery(command: string): Record<string, unknown>[] {
  const output = execSync(
    `pnpm exec wrangler d1 execute local-pawl --local --json --command "${command}"`,
    { cwd: passDir, stdio: "pipe" },
  ).toString();
  const parsed = JSON.parse(output.slice(output.indexOf("["))) as {
    results?: Record<string, unknown>[];
  }[];
  return parsed[0]?.results ?? [];
}

export function clearRateLimits(): void {
  let listed = "";
  try {
    listed = execSync(
      "pnpm exec wrangler kv key list --binding SESSIONS --local --prefix rate:",
      { cwd: passDir, stdio: "pipe" },
    ).toString();
  } catch {
    return;
  }
  const start = listed.indexOf("[");
  if (start < 0) return;
  let keys: Array<{ name: string }> = [];
  try {
    keys = JSON.parse(listed.slice(start)) as Array<{ name: string }>;
  } catch {
    return;
  }
  const stale = keys
    .map((key) => key.name)
    .filter((name) => name.startsWith("rate:"));
  if (stale.length === 0) return;
  const list = path.join(tmpdir(), `pawl-rate-keys-${process.pid}.json`);
  writeFileSync(list, JSON.stringify(stale));
  try {
    execSync(
      `pnpm exec wrangler kv bulk delete --binding SESSIONS --local --force "${list}"`,
      { cwd: passDir, stdio: "pipe" },
    );
  } catch {
    return;
  } finally {
    rmSync(list, { force: true });
  }
}

export function view(target: Page, name: string): Locator {
  return target.locator(`[data-view-panel='${name}']`);
}

export function goKey(target: Page): Locator {
  return target.locator("button[form='screen-form']");
}

export async function openSection(
  target: Page,
  name: "Profile" | "Devices" | "Apps" | "Security",
): Promise<void> {
  await view(target, "account")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(view(target, name.toLowerCase())).toBeVisible();
}

export async function freshAccount(
  target: Page,
  label: string,
  role: "USER" | "ADMIN" = "USER",
): Promise<PassAccount> {
  clearRateLimits();
  const stamp = Date.now().toString().slice(-6);
  const account = {
    user: `${label}${stamp}`.slice(0, 20),
    email: `${label}-${stamp}@example.com`,
  };
  await target.goto(`${PASS}/`);
  await view(target, "methods")
    .getByRole("button", { name: "Create one" })
    .click();
  const who = view(target, "register");
  await who.locator('input[name="username"]').fill(account.user);
  await who.locator('input[name="email"]').fill(account.email);
  await goKey(target).click();
  const key = view(target, "register-key");
  await key.locator('input[name="password"]').fill(PROBE_PASSWORD);
  await key.locator('input[name="confirm-password"]').fill(PROBE_PASSWORD);
  await goKey(target).click();
  await expect(view(target, "sent")).toBeVisible({ timeout: 20000 });
  passSql(
    `UPDATE users SET email_verified_at = datetime('now'), role = '${role}' ` +
      `WHERE email = '${account.email}'`,
  );
  return account;
}

export async function submitPassword(
  target: Page,
  origin: string,
  email: string,
  password: string,
): Promise<void> {
  await target.goto(`${origin}/`);
  await view(target, "methods").locator("[data-method='password']").click();
  const form = view(target, "password");
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(password);
  await goKey(target).click();
}

export async function signIn(
  target: Page,
  account: PassAccount,
  origin: string = PASS,
): Promise<void> {
  clearRateLimits();
  await submitPassword(target, origin, account.email, PROBE_PASSWORD);
  await expect(
    view(target, "account").getByRole("heading", { name: account.user }),
  ).toBeVisible({ timeout: 20000 });
}

export async function signedInAs(
  target: Page,
  label: string,
  role: "USER" | "ADMIN",
): Promise<PassAccount> {
  const account = await freshAccount(target, label, role);
  await signIn(target, account);
  return account;
}
