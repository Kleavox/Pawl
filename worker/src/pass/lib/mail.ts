import { sendEmail } from "./http";
import type { Env } from "../env";

export async function sendVerificationEmail(
  env: Env,
  email: string,
  username: string,
  token: string,
): Promise<void> {
  const url = new URL("/verify", env.PUBLIC_ORIGIN);
  url.searchParams.set("token", token);

  await sendEmail(env, "[pass email]", {
    to: email,
    subject: "Verify your Pawl account",
    html: accountEmail(
      "Verify your account",
      `Hi ${escapeHtml(username)}, confirm this email address to activate Pawl.`,
      "Verify email",
      url.toString(),
      "This link expires in 30 minutes.",
    ),
  });
}

export async function sendPasswordResetEmail(
  env: Env,
  email: string,
  username: string,
  token: string,
): Promise<void> {
  const url = new URL("/reset", env.PUBLIC_ORIGIN);
  url.searchParams.set("token", token);

  await sendEmail(env, "[pass email]", {
    to: email,
    subject: "Reset your Pawl password",
    html: accountEmail(
      "Reset your password",
      `Hi ${escapeHtml(username)}, use this link to choose a new Pawl password.`,
      "Reset password",
      url.toString(),
      "This link expires in 15 minutes. Ignore this email if you did not request it.",
    ),
  });
}

export async function sendOAuthLinkEmail(
  env: Env,
  email: string,
  username: string,
  provider: string,
  token: string,
): Promise<void> {
  const url = new URL("/link-oauth", env.PUBLIC_ORIGIN);
  url.searchParams.set("token", token);
  const providerLabel = provider === "google" ? "Google" : "GitHub";

  await sendEmail(env, "[pass email]", {
    to: email,
    subject: `Confirm linking ${providerLabel} to your Pawl account`,
    html: accountEmail(
      `Link ${providerLabel} sign-in`,
      `Hi ${escapeHtml(username)}, someone signed in with ${escapeHtml(providerLabel)} using this email address. Confirm below to let that ${escapeHtml(providerLabel)} account sign in to your Pawl account. If this was not you, ignore this email and nothing will change.`,
      `Link ${providerLabel}`,
      url.toString(),
      "This link expires in 15 minutes.",
    ),
  });
}

function accountEmail(
  title: string,
  intro: string,
  action: string,
  url: string,
  note: string,
): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f3f1ea;color:#161713;font-family:Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:48px 24px">
      <p style="font-weight:700">Pawl</p>
      <h1 style="font-size:32px;line-height:1.1">${escapeHtml(title)}</h1>
      <p style="line-height:1.7;color:#56574f">${intro}</p>
      <p style="margin:32px 0">
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#161713;color:#fff;padding:13px 18px;text-decoration:none;border-radius:4px">${escapeHtml(action)}</a>
      </p>
      <p style="font-size:13px;line-height:1.6;color:#77786f">${escapeHtml(note)}</p>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
