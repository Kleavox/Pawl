import type { DeployEnvironment } from "@pawl/core";

export interface MailEnv {
  RESEND_API_KEY?: string;
  FROM_EMAIL: string;
  ENVIRONMENT: DeployEnvironment;
}

export async function sendEmail(
  env: MailEnv,
  label: string,
  message: { to: string | string[]; subject: string; html: string },
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (env.ENVIRONMENT === "production") {
      throw new Error("RESEND_API_KEY is required in production");
    }
    console.log(label, { to: message.to, subject: message.subject });
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: message.to,
      subject: message.subject,
      html: message.html,
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend responded with ${response.status}`);
  }
}
