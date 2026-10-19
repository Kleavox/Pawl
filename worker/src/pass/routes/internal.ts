import { INTERNAL_HOSTS } from "@pawl/config";

import { listSessions } from "../lib/session";
import { claimsFor, findClaimsUser } from "../oidc/claims";
import { findGrant } from "../oidc/grants";
import { findOutsideApp, listOutsideApps } from "../oidc/outside";
import { renewAccessToken } from "../oidc/renew";
import { mintCardToken } from "../oidc/tokens";
import { apiError, checkVerification, type PassApp } from "./shared";

export function registerInternalRoutes(app: PassApp): void {
  app.post("/internal/renew", async (context) => {
    if (new URL(context.req.url).hostname !== INTERNAL_HOSTS.PASS) {
      return context.body(null, 404);
    }
    const body = (await context.req.json().catch(() => null)) as {
      token?: unknown;
    } | null;
    const renewed =
      typeof body?.token === "string"
        ? await renewAccessToken(context.env, body.token)
        : null;
    return renewed === null
      ? context.json({ code: "session_ended" }, 401)
      : context.json({ access_token: renewed });
  });

  app.get("/internal/outside-apps", async (context) => {
    if (new URL(context.req.url).hostname !== INTERNAL_HOSTS.PASS) {
      return context.body(null, 404);
    }
    const apps = await listOutsideApps(context.env);
    return context.json({
      apps: apps.map(({ key, label, title, origin, access, card }) => ({
        key,
        label,
        title,
        origin,
        access,
        card,
      })),
    });
  });

  app.get("/internal/card-token", async (context) => {
    if (new URL(context.req.url).hostname !== INTERNAL_HOSTS.PASS) {
      return context.body(null, 404);
    }
    const key = context.req.query("key");
    const userId = context.req.query("user");
    if (!key || !userId) {
      return context.json(
        { code: "INVALID_INPUT", message: "Missing key or user." },
        400,
      );
    }
    const outside = await findOutsideApp(context.env, key);
    if (!outside?.card) {
      return context.json(
        { code: "NOT_FOUND", message: "No app with a card has that key." },
        404,
      );
    }
    const user = await findClaimsUser(context.env, userId);
    if (!user) {
      return context.json(
        {
          code: "ACCOUNT_UNAVAILABLE",
          message: "This account cannot be used.",
        },
        403,
      );
    }
    const grant = await findGrant(context.env, user.id, outside.clientId);
    if (!grant) {
      return context.json(
        { code: "CONSENT_REQUIRED", clientId: outside.clientId },
        409,
      );
    }
    const token = await mintCardToken(context.env, {
      clientId: outside.clientId,
      sub: grant.subject,
      claims: claimsFor(user, grant.scopes),
    });
    return context.json({
      token,
      origin: outside.origin,
      clientId: outside.clientId,
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

  app.get("/internal/devices", async (context) => {
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
    return context.json({
      devices: (await listSessions(context.env, id)).length,
    });
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
