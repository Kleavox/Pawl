import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
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
      "pnpm exec wrangler kv key list --binding SESSIONS --local",
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
  for (const key of keys) {
    if (!key.name.startsWith("rate:")) continue;
    try {
      execSync(
        `pnpm exec wrangler kv key delete --binding SESSIONS --local "${key.name}"`,
        { cwd: passDir, stdio: "pipe" },
      );
    } catch {
      continue;
    }
  }
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
  await target.getByRole("button", { name: "Create an account" }).click();
  await target.locator('input[name="username"]').fill(account.user);
  await target.locator('input[name="email"]').fill(account.email);
  await target.locator('input[name="password"]').fill(PROBE_PASSWORD);
  await target.locator('input[name="confirm-password"]').fill(PROBE_PASSWORD);
  await target
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(target.getByText("Check your email")).toBeVisible({
    timeout: 20000,
  });
  passSql(
    `UPDATE users SET email_verified_at = datetime('now'), role = '${role}' ` +
      `WHERE email = '${account.email}'`,
  );
  return account;
}

export async function signIn(
  target: Page,
  account: PassAccount,
): Promise<void> {
  clearRateLimits();
  await target.goto(`${PASS}/`);
  await target.locator('input[name="email"]').fill(account.email);
  await target.locator('input[name="password"]').fill(PROBE_PASSWORD);
  await target.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(target.getByRole("heading", { name: account.user })).toBeVisible(
    { timeout: 20000 },
  );
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
