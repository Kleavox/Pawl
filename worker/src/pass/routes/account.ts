import { readCookie, VERIFICATION_COOKIE } from "@pawl/auth";

import {
  findAccountKeys,
  prepareAccountKeysUpsert,
} from "../account/credentials";
import { createAccountLifecycle } from "../account/lifecycle";
import { clearSessionCookie } from "../lib/cookies";
import { hashToken } from "../lib/crypto";
import { sendPasswordResetEmail, sendVerificationEmail } from "../lib/mail";
import { rateLimit } from "../lib/rate-limit";
import { putIdentityOverride } from "../lib/session";
import {
  accountDeleteSchema,
  accountPasswordSchema,
  accountSetupSchema,
  accountUpdateSchema,
  apiError,
  checkVerification,
  clientIp,
  createVerificationToken,
  currentSession,
  emailActionSchema,
  EMAIL_VERIFICATION_TTL_MS,
  findUserByEmail,
  firstIssue,
  genericEmailResponse,
  PASSWORD_RESET_TTL_MS,
  rateLimitError,
  registerSchema,
  resetPasswordSchema,
  safeAudit,
  tokenActionSchema,
  usernameTakenBy,
  type PassApp,
  type TokenRow,
} from "./shared";

export function registerAccountRoutes(app: PassApp): void {
  app.post("/api/register", async (context) => {
    const body = registerSchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }

    const ip = clientIp(context.req.raw);
    const ipLimit = await rateLimit(context.env, "register-ip", ip, 5, 3600);
    const emailLimit = await rateLimit(
      context.env,
      "register-email",
      body.data.email,
      3,
      3600,
    );
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return rateLimitError(
        context,
        Math.max(ipLimit.retryAfter, emailLimit.retryAfter),
      );
    }

    if (
      !(await checkVerification(
        context.env,
        readCookie(context.req.raw, VERIFICATION_COOKIE),
        "fresh",
      ))
    ) {
      return apiError(
        context,
        400,
        "challenge_failed",
        "Security challenge failed.",
      );
    }

    const existing = await findUserByEmail(context.env, body.data.email);
    if (existing?.email_verified_at) {
      return apiError(
        context,
        409,
        "account_exists",
        "An account already exists for this email.",
      );
    }

    const usernameTaken = await context.env.DB.prepare(
      `SELECT id FROM users WHERE username = ? AND id IS NOT ? LIMIT 1`,
    )
      .bind(body.data.username, existing?.id ?? null)
      .first<{ id: string }>();
    if (usernameTaken) {
      return apiError(
        context,
        409,
        "username_taken",
        "This username is already in use.",
      );
    }

    const userId = existing?.id ?? crypto.randomUUID();
    const identityId = existing?.identity_id ?? crypto.randomUUID();
    const credential = body.data.keys;
    const passwordHash = null;
    const verification = await createVerificationToken(
      "EMAIL",
      EMAIL_VERIFICATION_TTL_MS,
    );

    const statements: D1PreparedStatement[] = [];
    if (existing) {
      statements.push(
        context.env.DB.prepare(
          `UPDATE users
         SET username = ?, updated_at = datetime('now')
         WHERE id = ?`,
        ).bind(body.data.username, userId),
      );
      if (existing.identity_id) {
        statements.push(
          context.env.DB.prepare(
            `UPDATE identities
           SET password_hash = ?, provider_subject = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
          ).bind(passwordHash, body.data.email, identityId),
        );
      } else {
        statements.push(
          context.env.DB.prepare(
            `INSERT INTO identities (
             id, user_id, provider, provider_subject, password_hash
           ) VALUES (?, ?, 'password', ?, ?)`,
          ).bind(identityId, userId, body.data.email, passwordHash),
        );
      }
    } else {
      statements.push(
        context.env.DB.prepare(
          `INSERT INTO users (id, email, username)
         VALUES (?, ?, ?)`,
        ).bind(userId, body.data.email, body.data.username),
        context.env.DB.prepare(
          `INSERT INTO identities (
           id, user_id, provider, provider_subject, password_hash
         ) VALUES (?, ?, 'password', ?, ?)`,
        ).bind(identityId, userId, body.data.email, passwordHash),
      );
    }

    if (credential) {
      statements.push(
        await prepareAccountKeysUpsert(context.env, userId, credential),
      );
    }

    statements.push(
      context.env.DB.prepare(
        `DELETE FROM verification_tokens
       WHERE user_id = ? AND purpose = 'EMAIL' AND consumed_at IS NULL`,
      ).bind(userId),
      context.env.DB.prepare(
        `INSERT INTO verification_tokens (
         id, user_id, purpose, token_hash, expires_at
       ) VALUES (?, ?, 'EMAIL', ?, ?)`,
      ).bind(
        verification.id,
        userId,
        verification.hash,
        verification.expiresAt,
      ),
    );

    await context.env.DB.batch(statements);
    try {
      await sendVerificationEmail(
        context.env,
        body.data.email,
        body.data.username,
        verification.raw,
      );
    } catch (cause) {
      console.error("[pass email]", cause);
      return apiError(
        context,
        503,
        "email_delivery_failed",
        "Account saved, but the verification email could not be sent. Check Resend, then retry.",
      );
    }
    await safeAudit(context.env, {
      userId,
      type: existing ? "registration_restarted" : "registration_created",
      request: context.req.raw,
    });

    return context.json(
      {
        ok: true,
        message: "Check your email to verify the account.",
      },
      201,
    );
  });

  app.post("/api/verification/resend", async (context) => {
    const body = emailActionSchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }

    const ip = clientIp(context.req.raw);
    const limit = await rateLimit(
      context.env,
      "verification-resend",
      `${ip}:${body.data.email}`,
      3,
      3600,
    );
    if (!limit.allowed) return rateLimitError(context, limit.retryAfter);

    if (
      !(await checkVerification(
        context.env,
        readCookie(context.req.raw, VERIFICATION_COOKIE),
        "fresh",
      ))
    ) {
      return apiError(
        context,
        400,
        "challenge_failed",
        "Security challenge failed.",
      );
    }

    const user = await findUserByEmail(context.env, body.data.email);
    if (user && !user.email_verified_at && user.identity_id) {
      const verification = await createVerificationToken(
        "EMAIL",
        EMAIL_VERIFICATION_TTL_MS,
      );
      await context.env.DB.batch([
        context.env.DB.prepare(
          `DELETE FROM verification_tokens
         WHERE user_id = ? AND purpose = 'EMAIL' AND consumed_at IS NULL`,
        ).bind(user.id),
        context.env.DB.prepare(
          `INSERT INTO verification_tokens (
           id, user_id, purpose, token_hash, expires_at
         ) VALUES (?, ?, 'EMAIL', ?, ?)`,
        ).bind(
          verification.id,
          user.id,
          verification.hash,
          verification.expiresAt,
        ),
      ]);
      await sendVerificationEmail(
        context.env,
        user.email,
        user.username ?? "there",
        verification.raw,
      );
      await safeAudit(context.env, {
        userId: user.id,
        type: "verification_resent",
        request: context.req.raw,
      });
    }

    return genericEmailResponse(context);
  });

  app.post("/api/verify-email", async (context) => {
    const body = tokenActionSchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }

    const limit = await rateLimit(
      context.env,
      "verify-email",
      clientIp(context.req.raw),
      10,
      3600,
    );
    if (!limit.allowed) return rateLimitError(context, limit.retryAfter);

    const tokenHash = await hashToken(body.data.token);
    const token = await context.env.DB.prepare(
      `SELECT vt.id, vt.user_id, vt.expires_at, u.email, u.username,
            u.auth_version
     FROM verification_tokens vt
     JOIN users u ON u.id = vt.user_id
     WHERE vt.token_hash = ? AND vt.purpose = 'EMAIL'
       AND vt.consumed_at IS NULL
     LIMIT 1`,
    )
      .bind(tokenHash)
      .first<TokenRow>();

    if (!token || Date.parse(token.expires_at) <= Date.now()) {
      return apiError(
        context,
        400,
        "invalid_token",
        "Verification link is invalid or expired.",
      );
    }

    await context.env.DB.batch([
      context.env.DB.prepare(
        `UPDATE users
       SET email_verified_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
      ).bind(token.user_id),
      context.env.DB.prepare(
        `UPDATE verification_tokens
       SET consumed_at = datetime('now')
       WHERE id = ?`,
      ).bind(token.id),
      context.env.DB.prepare(
        `DELETE FROM verification_tokens
       WHERE user_id = ? AND purpose = 'EMAIL' AND id != ?`,
      ).bind(token.user_id, token.id),
    ]);
    await safeAudit(context.env, {
      userId: token.user_id,
      type: "email_verified",
      request: context.req.raw,
    });

    return context.json({ ok: true });
  });

  app.get("/api/account", async (context) => {
    const session = await currentSession(context);
    if (!session) {
      return apiError(context, 401, "unauthorized", "Sign in first.");
    }

    const identities = await context.env.DB.prepare(
      `SELECT provider FROM identities WHERE user_id = ? ORDER BY created_at`,
    )
      .bind(session.identity.id)
      .all<{ provider: string }>();

    const providers = identities.results.map((row) => row.provider);
    if (
      !providers.includes("password") &&
      (await findAccountKeys(context.env, session.identity.id))
    ) {
      providers.push("password");
    }

    return context.json({ user: session.identity, providers });
  });

  app.patch("/api/account", async (context) => {
    const session = await currentSession(context);
    if (!session) {
      return apiError(context, 401, "unauthorized", "Sign in first.");
    }

    const body = accountUpdateSchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }

    const taken = await usernameTakenBy(
      context.env,
      body.data.username,
      session.identity.id,
    );
    if (taken) {
      return apiError(
        context,
        409,
        "username_taken",
        "This username is already in use.",
      );
    }

    await context.env.DB.prepare(
      `UPDATE users
     SET username = ?, updated_at = datetime('now')
     WHERE id = ?`,
    )
      .bind(body.data.username, session.identity.id)
      .run();

    const identity = { ...session.identity, username: body.data.username };
    await putIdentityOverride(context.env, identity);
    await safeAudit(context.env, {
      userId: identity.id,
      type: "username_updated",
      request: context.req.raw,
    });

    return context.json({ ok: true, user: identity });
  });

  app.post("/api/account/setup", async (context) => {
    const session = await currentSession(context);
    if (!session) {
      return apiError(context, 401, "unauthorized", "Sign in first.");
    }

    const body = accountSetupSchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }

    const result = await createAccountLifecycle(context.env).setup({
      identity: session.identity,
      username: body.data.username,
      keys: body.data.keys,
      request: context.req.raw,
    });
    if (result.kind === "already_set") {
      return apiError(
        context,
        409,
        "already_set",
        "This account already has a username.",
      );
    }
    if (result.kind === "username_taken") {
      return apiError(
        context,
        409,
        "username_taken",
        "This username is already in use.",
      );
    }
    return context.json({ ok: true, user: result.identity });
  });

  app.delete("/api/account", async (context) => {
    const session = await currentSession(context);
    if (!session) {
      return apiError(context, 401, "unauthorized", "Sign in first.");
    }

    if (
      !(await checkVerification(
        context.env,
        readCookie(context.req.raw, VERIFICATION_COOKIE),
        "fresh",
      ))
    ) {
      return apiError(
        context,
        403,
        "challenge_failed",
        "Security challenge failed.",
      );
    }

    const body = accountDeleteSchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }
    if (body.data.confirmEmail !== session.identity.email.toLowerCase()) {
      return apiError(
        context,
        400,
        "confirmation_mismatch",
        "Type your account email to confirm deletion.",
      );
    }

    const userId = session.identity.id;
    const result = await createAccountLifecycle(context.env).delete({
      userId,
      request: context.req.raw,
    });
    if (result.kind === "purge_failed") {
      return apiError(
        context,
        502,
        "purge_failed",
        "Account data could not be removed. Try again in a moment.",
      );
    }

    context.header(
      "Set-Cookie",
      clearSessionCookie(context.req.raw, context.env),
    );
    return context.json({ ok: true });
  });

  app.post("/api/account/password", async (context) => {
    const session = await currentSession(context);
    if (!session) {
      return apiError(context, 401, "unauthorized", "Sign in first.");
    }

    if (
      !(await checkVerification(
        context.env,
        readCookie(context.req.raw, VERIFICATION_COOKIE),
        "fresh",
      ))
    ) {
      return apiError(
        context,
        403,
        "challenge_failed",
        "Security challenge failed.",
      );
    }

    const body = accountPasswordSchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }

    const result = await createAccountLifecycle(context.env).setCredential({
      userId: session.identity.id,
      keys: body.data.keys,
      request: context.req.raw,
    });
    if (result.kind === "exists") {
      return apiError(
        context,
        409,
        "password_exists",
        "This account already has an encryption passphrase. Use the reset flow to change it.",
      );
    }

    return context.json({ ok: true });
  });

  app.post("/api/password/forgot", async (context) => {
    const body = emailActionSchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }

    const ip = clientIp(context.req.raw);
    const limit = await rateLimit(
      context.env,
      "password-forgot",
      `${ip}:${body.data.email}`,
      5,
      3600,
    );
    if (!limit.allowed) return rateLimitError(context, limit.retryAfter);

    if (
      !(await checkVerification(
        context.env,
        readCookie(context.req.raw, VERIFICATION_COOKIE),
        "fresh",
      ))
    ) {
      return apiError(
        context,
        400,
        "challenge_failed",
        "Security challenge failed.",
      );
    }

    const user = await findUserByEmail(context.env, body.data.email);
    const canReset =
      user?.email_verified_at &&
      (user.identity_id || (await findAccountKeys(context.env, user.id)));
    if (user && canReset) {
      const reset = await createVerificationToken(
        "PASSWORD_RESET",
        PASSWORD_RESET_TTL_MS,
      );
      await context.env.DB.batch([
        context.env.DB.prepare(
          `DELETE FROM verification_tokens
         WHERE user_id = ? AND purpose = 'PASSWORD_RESET'
           AND consumed_at IS NULL`,
        ).bind(user.id),
        context.env.DB.prepare(
          `INSERT INTO verification_tokens (
           id, user_id, purpose, token_hash, expires_at
         ) VALUES (?, ?, 'PASSWORD_RESET', ?, ?)`,
        ).bind(reset.id, user.id, reset.hash, reset.expiresAt),
      ]);
      await sendPasswordResetEmail(
        context.env,
        user.email,
        user.username ?? "there",
        reset.raw,
      );
      await safeAudit(context.env, {
        userId: user.id,
        type: "password_reset_requested",
        request: context.req.raw,
      });
    }

    return genericEmailResponse(context);
  });

  app.post("/api/password/reset", async (context) => {
    const body = resetPasswordSchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }

    const limit = await rateLimit(
      context.env,
      "password-reset",
      clientIp(context.req.raw),
      10,
      3600,
    );
    if (!limit.allowed) return rateLimitError(context, limit.retryAfter);

    const tokenHash = await hashToken(body.data.token);
    const result = await createAccountLifecycle(context.env).resetCredential({
      tokenHash,
      keys: body.data.keys,
      request: context.req.raw,
    });
    if (result.kind === "invalid_token") {
      return apiError(
        context,
        400,
        "invalid_token",
        "Password reset link is invalid or expired.",
      );
    }

    context.header(
      "Set-Cookie",
      clearSessionCookie(context.req.raw, context.env),
    );
    return context.json({ ok: true });
  });
}
