import { readCookie, VERIFICATION_COOKIE, verifyTurnstile } from "@pawl/auth";

import { findAccountKeys } from "../account/credentials";
import {
  clearSessionCookie,
  makeSessionCookie,
  makeVerificationCookie,
  VERIFICATION_TTL_SECONDS,
} from "../lib/cookies";
import { hashToken, randomToken, verifyAuthVerifier } from "../lib/crypto";
import { safeReturnTo } from "../lib/oauth";
import { rateLimit } from "../lib/rate-limit";
import {
  createSession,
  deleteSession,
  deleteSessionById,
  getSession,
  invalidateUserSessions,
  listSessions,
  purgeUserSessions,
  readSessionToken,
} from "../lib/session";
import {
  apiError,
  challengeSchema,
  checkVerification,
  clientIp,
  currentSession,
  findUserByEmail,
  firstIssue,
  loginSchema,
  preloginSchema,
  rateLimitError,
  safeAudit,
  sessionClient,
  toIdentity,
  type PassApp,
  type VerificationRecord,
} from "./shared";

export function registerAuthRoutes(app: PassApp): void {
  app.post("/api/login/prelogin", async (context) => {
    const body = preloginSchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }
    const limit = await rateLimit(
      context.env,
      "prelogin-ip",
      clientIp(context.req.raw),
      30,
      900,
    );
    if (!limit.allowed) return rateLimitError(context, limit.retryAfter);

    const user = await findUserByEmail(context.env, body.data.email);
    const keys = user?.id ? await findAccountKeys(context.env, user.id) : null;
    return context.json({ salt: keys?.kdf_salt ?? null });
  });

  app.post("/api/login", async (context) => {
    const body = loginSchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }

    const ip = clientIp(context.req.raw);
    const ipLimit = await rateLimit(context.env, "login-ip", ip, 20, 900);
    const emailLimit = await rateLimit(
      context.env,
      "login-email",
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

    const user = await findUserByEmail(context.env, body.data.email);
    const keys = user?.id ? await findAccountKeys(context.env, user.id) : null;
    const verifierValid = keys
      ? await verifyAuthVerifier(
          body.data.authVerifier,
          keys.auth_verifier_hash,
        )
      : false;
    if (!user || !keys || !verifierValid || user.disabled_at) {
      await safeAudit(context.env, {
        userId: user?.id,
        type: "login_failed",
        request: context.req.raw,
      });
      return apiError(
        context,
        401,
        "invalid_credentials",
        "Email or password is incorrect.",
      );
    }
    if (!user.email_verified_at) {
      return apiError(
        context,
        403,
        "email_unverified",
        "Verify your email before signing in.",
      );
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
      type: "login_succeeded",
      request: context.req.raw,
    });
    context.header(
      "Set-Cookie",
      makeSessionCookie(context.req.raw, context.env, created.token),
    );
    return context.json({ authenticated: true, user: identity });
  });

  app.post("/api/logout", async (context) => {
    const token = readSessionToken(context.req.raw);
    const session = token ? await getSession(context.env, token) : null;
    if (token) await deleteSession(context.env, token);

    context.header(
      "Set-Cookie",
      clearSessionCookie(context.req.raw, context.env),
    );
    if (session) {
      await safeAudit(context.env, {
        userId: session.identity.id,
        type: "logout",
        request: context.req.raw,
      });
    }
    return context.json({ ok: true });
  });

  app.get("/api/session", async (context) => {
    const token = readSessionToken(context.req.raw);
    const session = token ? await getSession(context.env, token) : null;
    if (!session) return context.json({ authenticated: false });

    return context.json({
      authenticated: true,
      user: session.identity,
      expiresAt: session.expiresAt,
    });
  });

  app.get("/api/sessions", async (context) => {
    const session = await currentSession(context);
    if (!session) {
      return apiError(context, 401, "unauthorized", "Sign in first.");
    }

    const devices = await listSessions(context.env, session.identity.id);
    return context.json({
      sessions: devices
        .map((device) => ({
          id: device.sessionId,
          createdAt: device.createdAt,
          expiresAt: device.expiresAt,
          userAgent: device.userAgent,
          ip: device.ip,
          current: device.sessionId === session.sessionId,
        }))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    });
  });

  app.delete("/api/sessions/:id", async (context) => {
    const session = await currentSession(context);
    if (!session) {
      return apiError(context, 401, "unauthorized", "Sign in first.");
    }

    const targetId = context.req.param("id");
    const deleted = await deleteSessionById(
      context.env,
      session.identity.id,
      targetId,
    );
    if (!deleted) {
      return apiError(context, 404, "not_found", "Unknown session.");
    }

    await safeAudit(context.env, {
      userId: session.identity.id,
      type: "session_revoked",
      request: context.req.raw,
    });

    if (targetId === session.sessionId) {
      context.header(
        "Set-Cookie",
        clearSessionCookie(context.req.raw, context.env),
      );
    }
    return context.json({ ok: true });
  });

  app.post("/api/sessions/revoke-all", async (context) => {
    const rawToken = readSessionToken(context.req.raw);
    const session = rawToken ? await getSession(context.env, rawToken) : null;
    if (!session) {
      return apiError(context, 401, "unauthorized", "Sign in to continue.");
    }

    const row = await context.env.DB.prepare(
      `UPDATE users
     SET auth_version = auth_version + 1, updated_at = datetime('now')
     WHERE id = ?
     RETURNING auth_version`,
    )
      .bind(session.identity.id)
      .first<{ auth_version: number }>();

    if (!row) {
      return apiError(context, 401, "unauthorized", "Sign in to continue.");
    }

    await invalidateUserSessions(
      context.env,
      session.identity.id,
      row.auth_version,
    );
    await purgeUserSessions(context.env, session.identity.id);
    context.header(
      "Set-Cookie",
      clearSessionCookie(context.req.raw, context.env),
    );
    await safeAudit(context.env, {
      userId: session.identity.id,
      type: "sessions_revoked",
      request: context.req.raw,
    });
    return context.json({ ok: true });
  });

  app.post("/api/challenge", async (context) => {
    const body = challengeSchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }

    const ip = clientIp(context.req.raw);
    if (!(await verifyTurnstile(context.env, body.data.token, ip))) {
      return apiError(
        context,
        400,
        "challenge_failed",
        "Security challenge failed.",
      );
    }

    const token = randomToken();
    const ttl = VERIFICATION_TTL_SECONDS[body.data.scope];
    const issuedAt = Date.now();
    const record: VerificationRecord = {
      scope: body.data.scope,
      issuedAt,
      expiresAt: issuedAt + ttl * 1000,
      ip,
    };
    await context.env.SESSIONS.put(
      `verification:${await hashToken(token)}`,
      JSON.stringify(record),
      { expirationTtl: ttl },
    );

    context.header(
      "Set-Cookie",
      makeVerificationCookie(context.req.raw, context.env, token, ttl),
    );

    return context.json({
      ok: true,
      returnTo: safeReturnTo(body.data.returnTo ?? null, context.env),
    });
  });

  app.get("/api/challenge/status", async (context) => {
    const scopeParam = context.req.query("scope");
    const scope: "basic" | "fresh" = scopeParam === "basic" ? "basic" : "fresh";
    const token = readCookie(context.req.raw, VERIFICATION_COOKIE);
    const verified = await checkVerification(context.env, token, scope);
    return context.json({ verified });
  });
}
