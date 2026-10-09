import { INTERNAL_HOSTS, SESSION_COOKIE } from "@pawl/config";

import {
  getSession,
  invalidateUserSessions,
  purgeUserSessions,
} from "../lib/session";
import { apiError, checkVerification, safeAudit, type PassApp } from "./shared";

export function registerInternalRoutes(app: PassApp): void {
  app.get("/internal/session", async (context) => {
    if (new URL(context.req.url).hostname !== INTERNAL_HOSTS.PASS) {
      return context.body(null, 404);
    }

    const token = context.req.header("x-pawl-session");
    if (!token)
      return context.json(
        { code: "UNAUTHORIZED", message: "Invalid or missing token." },
        401,
      );

    const session = await getSession(context.env, token);
    if (!session)
      return context.json(
        { code: "UNAUTHORIZED", message: "Invalid or missing token." },
        401,
      );
    return context.json(session);
  });

  app.post("/internal/logout", async (context) => {
    if (new URL(context.req.url).hostname !== INTERNAL_HOSTS.PASS) {
      return context.body(null, 404);
    }

    const token = context.req.header("x-pawl-session");
    if (!token)
      return context.json(
        { code: "UNAUTHORIZED", message: "Invalid or missing token." },
        401,
      );

    const session = await getSession(context.env, token);
    if (!session)
      return context.json(
        { code: "UNAUTHORIZED", message: "Invalid or missing token." },
        401,
      );

    const row = await context.env.DB.prepare(
      `UPDATE users
     SET auth_version = auth_version + 1, updated_at = datetime('now')
     WHERE id = ?
     RETURNING auth_version`,
    )
      .bind(session.identity.id)
      .first<{ auth_version: number }>();

    if (row) {
      await invalidateUserSessions(
        context.env,
        session.identity.id,
        row.auth_version,
      );
    }
    await purgeUserSessions(context.env, session.identity.id);

    await safeAudit(context.env, {
      userId: session.identity.id,
      type: "sessions_revoked",
      request: context.req.raw,
    });

    const root = context.env.ROOT_DOMAIN.toLowerCase();
    return context.json({
      ok: true,
      cookie: `${SESSION_COOKIE}=; Path=/; Domain=.${root}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    });
  });

  app.get("/internal/identity", async (context) => {
    if (new URL(context.req.url).hostname !== INTERNAL_HOSTS.PASS) {
      return context.body(null, 404);
    }

    const id = context.req.query("id");
    if (!id) {
      return context.json(
        { code: "INVALID_INPUT", message: "Missing id." },
        400,
      );
    }

    const user = await context.env.DB.prepare(
      `SELECT email, username FROM users WHERE id = ? AND disabled_at IS NULL`,
    )
      .bind(id)
      .first<{ email: string; username: string | null }>();
    if (!user) {
      return context.json({ code: "NOT_FOUND", message: "Unknown user." }, 404);
    }

    return context.json({ email: user.email, username: user.username });
  });

  app.get("/internal/public-key", async (context) => {
    if (new URL(context.req.url).hostname !== INTERNAL_HOSTS.PASS) {
      return context.body(null, 404);
    }

    const username = context.req.query("username");
    if (!username) {
      return context.json(
        { code: "INVALID_INPUT", message: "Missing username." },
        400,
      );
    }

    const row = await context.env.DB.prepare(
      `SELECT u.id AS user_id, ak.account_public_key
       FROM users u
       JOIN account_keys ak ON ak.user_id = u.id
       WHERE u.username = ?
         AND u.disabled_at IS NULL
         AND u.email_verified_at IS NOT NULL`,
    )
      .bind(username)
      .first<{ user_id: string; account_public_key: string }>();

    return context.json({
      userId: row?.user_id ?? null,
      publicKey: row?.account_public_key ?? null,
    });
  });

  app.get("/internal/account-key", async (context) => {
    if (new URL(context.req.url).hostname !== INTERNAL_HOSTS.PASS) {
      return context.body(null, 404);
    }

    const userId = context.req.query("userId");
    if (!userId) {
      return context.json(
        { code: "INVALID_INPUT", message: "Missing userId." },
        400,
      );
    }

    const row = await context.env.DB.prepare(
      `SELECT kdf_salt, wrapped_private_key
       FROM account_keys WHERE user_id = ?`,
    )
      .bind(userId)
      .first<{ kdf_salt: string; wrapped_private_key: string }>();

    return context.json({
      salt: row?.kdf_salt ?? null,
      wrappedPrivateKey: row?.wrapped_private_key ?? null,
    });
  });

  app.get("/internal/admins", async (context) => {
    if (new URL(context.req.url).hostname !== INTERNAL_HOSTS.PASS) {
      return context.body(null, 404);
    }

    const admins = await context.env.DB.prepare(
      `SELECT email FROM users
     WHERE role = 'ADMIN'
       AND disabled_at IS NULL
       AND email_verified_at IS NOT NULL`,
    ).all<{ email: string }>();

    return context.json({ emails: admins.results.map((row) => row.email) });
  });

  app.get("/internal/challenge", async (context) => {
    if (new URL(context.req.url).hostname !== INTERNAL_HOSTS.PASS) {
      return context.body(null, 404);
    }

    const scope = context.req.query("scope");
    if (scope !== "basic" && scope !== "fresh") {
      return apiError(context, 400, "invalid_input", "Invalid scope.");
    }

    const token = context.req.header("x-pawl-verification") ?? null;
    const verified = await checkVerification(context.env, token, scope);
    if (!verified)
      return context.json(
        { code: "UNAUTHORIZED", message: "Invalid or missing token." },
        401,
      );

    return context.json({ ok: true });
  });
}
