import { sendEmail } from "@pawl/worker";

import { makeSessionCookie } from "../lib/cookies";
import { issueOtp, verifyOtp } from "../lib/otp";
import { rateLimit } from "../lib/rate-limit";
import { createSession } from "../lib/session";
import {
  apiError,
  clientIp,
  findUserByEmail,
  firstIssue,
  otpStartSchema,
  otpVerifySchema,
  rateLimitError,
  safeAudit,
  sessionClient,
  toIdentity,
  type PassApp,
} from "./shared";

export function registerOtpRoutes(app: PassApp): void {
  app.post("/api/auth/otp/start", async (context) => {
    const body = otpStartSchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }

    const ip = clientIp(context.req.raw);
    const ipLimit = await rateLimit(context.env, "otp-ip", ip, 10, 900);
    const emailLimit = await rateLimit(
      context.env,
      "otp-email",
      body.data.email,
      5,
      900,
    );
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return rateLimitError(
        context,
        Math.max(ipLimit.retryAfter, emailLimit.retryAfter),
      );
    }

    const code = await issueOtp(context.env, body.data.email);
    try {
      await sendEmail(context.env, "[pass otp]", {
        to: body.data.email,
        subject: "Your Pawl sign-in code",
        html: otpEmail(code),
      });
    } catch (cause) {
      console.error("[pass otp email]", cause);
      return apiError(
        context,
        503,
        "email_delivery_failed",
        "The code could not be emailed. Try again in a moment.",
      );
    }

    return context.json({ ok: true });
  });

  app.post("/api/auth/otp/verify", async (context) => {
    const body = otpVerifySchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }

    const ip = clientIp(context.req.raw);
    const ipLimit = await rateLimit(context.env, "otp-verify-ip", ip, 20, 900);
    const emailLimit = await rateLimit(
      context.env,
      "otp-verify-email",
      body.data.email,
      10,
      900,
    );
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return rateLimitError(
        context,
        Math.max(ipLimit.retryAfter, emailLimit.retryAfter),
      );
    }

    const result = await verifyOtp(
      context.env,
      body.data.email,
      body.data.code,
    );
    if (result.status === "wrong") {
      return apiError(context, 401, "invalid_code", "That code is incorrect.", {
        attemptsLeft: result.attemptsLeft,
      });
    }
    if (result.status === "expired") {
      return apiError(
        context,
        401,
        "code_expired",
        "That code has expired. Request a new one.",
      );
    }
    if (result.status === "exhausted") {
      return apiError(
        context,
        401,
        "too_many_attempts",
        "Too many incorrect attempts. Request a new code.",
      );
    }

    let user = await findUserByEmail(context.env, body.data.email);
    if (user?.disabled_at) {
      return apiError(
        context,
        403,
        "account_disabled",
        "This account has been disabled.",
      );
    }

    if (!user) {
      const userId = crypto.randomUUID();
      await context.env.DB.prepare(
        `INSERT INTO users (id, email, email_verified_at)
         VALUES (?, ?, datetime('now'))`,
      )
        .bind(userId, body.data.email)
        .run();
      user = {
        id: userId,
        email: body.data.email,
        username: null,
        role: "USER",
        email_verified_at: new Date().toISOString(),
        auth_version: 1,
        disabled_at: null,
        identity_id: null,
        password_hash: null,
      };
    } else if (!user.email_verified_at) {
      await context.env.DB.prepare(
        `UPDATE users
         SET email_verified_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(user.id)
        .run();
      user = { ...user, email_verified_at: new Date().toISOString() };
    }

    const identity = toIdentity(user);
    const created = await createSession(
      context.env,
      identity,
      user.auth_version,
      sessionClient(context.req.raw),
    );
    await context.env.DB.prepare(
      `UPDATE users
       SET last_login_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(user.id)
      .run();
    await safeAudit(context.env, {
      userId: user.id,
      type: "otp_login_succeeded",
      request: context.req.raw,
    });
    context.header(
      "Set-Cookie",
      makeSessionCookie(context.req.raw, context.env, created.token),
    );

    return context.json({
      authenticated: true,
      user: identity,
      needsSetup: user.username === null,
    });
  });
}

function otpEmail(code: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f3f1ea;color:#161713;font-family:Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:48px 24px">
      <p style="font-weight:700">Pawl</p>
      <h1 style="font-size:32px;line-height:1.1">Your sign-in code</h1>
      <p style="font-size:40px;font-weight:700;letter-spacing:8px">${code}</p>
      <p style="font-size:13px;line-height:1.6;color:#77786f">This code expires in 10 minutes. Ignore this email if you did not request it.</p>
    </div>
  </body>
</html>`;
}
