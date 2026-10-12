import type { DeployEnvironment } from "@pawl/core";
import type { MiddlewareHandler } from "hono";

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

export function securityHeaders(options: {
  referrerPolicy: string;
  csp?: string;
}): MiddlewareHandler {
  return async (context, next) => {
    await next();
    context.header("Referrer-Policy", options.referrerPolicy);
    context.header("X-Content-Type-Options", "nosniff");
    context.header("X-Frame-Options", "DENY");
    context.header(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    if (options.csp) {
      const type = context.res.headers.get("content-type") ?? "";
      if (
        type.includes("text/html") &&
        !context.res.headers.has("content-security-policy")
      ) {
        context.header("Content-Security-Policy", options.csp);
      }
    }
  };
}
