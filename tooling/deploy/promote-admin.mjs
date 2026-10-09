import { passD1 } from "./d1.mjs";

const args = process.argv.slice(2);
const local = hasFlag("--local");
const { query, run } = passD1({ local });
const list = hasFlag("--list");
const rawEmail = optionValue("--email");

const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

try {
  if (list) {
    printAdmins();
  } else {
    promote();
  }
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}

function promote() {
  if (!rawEmail) {
    throw new Error(
      "Missing --email. Usage: promote-admin.mjs --email you@example.com [--local]",
    );
  }
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error(
      `Refusing to use an unsafe or malformed email: ${rawEmail}`,
    );
  }

  const accounts = query(
    `SELECT email, role, email_verified_at FROM users WHERE email = '${email}'`,
  );
  const account = accounts[0];
  if (!account) {
    throw new Error(
      `No account for ${email}. Register and verify it in Pass first, then re-run.`,
    );
  }
  if (account.role === "ADMIN") {
    console.log(`${email} is already an ADMIN. Nothing to do.`);
    printAdmins();
    return;
  }

  run(
    `UPDATE users SET role='ADMIN', updated_at=datetime('now') WHERE email='${email}'`,
  );
  console.log(`\nPromoted ${email} to ADMIN.`);

  if (!account.email_verified_at) {
    console.warn(
      "\nWarning: this account's email is NOT verified. Verify the address in Pass\n" +
        "before relying on it: an unverified address is not proof of who holds it.",
    );
  }

  printAdmins();
}

function printAdmins() {
  const admins = query(
    "SELECT email, role FROM users WHERE role='ADMIN' ORDER BY email",
  );
  if (admins.length === 0) {
    console.log("\nNo ADMIN accounts exist yet.");
    return;
  }
  console.log("\nCurrent admins:");
  console.table(admins);
}

function hasFlag(name) {
  return args.includes(name);
}

function optionValue(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}
