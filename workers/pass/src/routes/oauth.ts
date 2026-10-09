import { makeSessionCookie } from "../lib/cookies";
import { hashToken, randomToken } from "../lib/crypto";
import { sendOAuthLinkEmail } from "../lib/mail";
import {
  beginOAuth,
  clearedStateCookie,
  finishOAuth,
  oauthFailure,
} from "../lib/oauth";
import { rateLimit } from "../lib/rate-limit";
import { createSession } from "../lib/session";
import {
  apiError,
  clientIp,
  firstIssue,
  oauthLinkSchema,
  oauthProvider,
  OAUTH_LINK_TTL_SECONDS,
  rateLimitError,
  resolveOAuthUser,
  safeAudit,
  sessionClient,
  toIdentity,
  type PassApp,
} from "./shared";

export function registerOAuthRoutes(app: PassApp): void {
  app.get("/api/oauth/providers", (context) =>
    context.json({
      google: Boolean(
        context.env.GOOGLE_CLIENT_ID && context.env.GOOGLE_CLIENT_SECRET,
      ),
      github: Boolean(
        context.env.GITHUB_CLIENT_ID && context.env.GITHUB_CLIENT_SECRET,
      ),
    }),
  );

  app.get("/api/oauth/:provider", async (context) => {
    const provider = oauthProvider(context.req.param("provider"));
    if (!provider) return context.body(null, 404);
    return beginOAuth(context.req.raw, context.env, provider);
  });

  app.get("/api/oauth/callback/:provider", async (context) => {
    const provider = oauthProvider(context.req.param("provider"));
    if (!provider) return context.body(null, 404);
    const result = await finishOAuth(context.req.raw, context.env, provider);
    if (result instanceof Response) return result;
    context.header("Set-Cookie", clearedStateCookie());

    const resolution = await resolveOAuthUser(context.env, result.profile);

    if (resolution.kind === "link_required") {
      const existing = resolution.existing;
      if (existing.disabled_at) {
        return oauthFailure(context.env, "account_disabled");
      }
      const linkToken = randomToken();
      await context.env.SESSIONS.put(
        `oauthlink:${await hashToken(linkToken)}`,
        JSON.stringify({
          provider: result.profile.provider,
          subject: result.profile.subject,
          userId: existing.id,
        }),
        { expirationTtl: OAUTH_LINK_TTL_SECONDS },
      );
      try {
        await sendOAuthLinkEmail(
          context.env,
          existing.email,
          existing.username ?? "there",
          provider,
          linkToken,
        );
      } catch (cause) {
        console.error("[pass email]", cause);
        return oauthFailure(context.env, "oauth_failed");
      }
      await safeAudit(context.env, {
        userId: existing.id,
        type: `oauth_${provider}_link_requested`,
        request: context.req.raw,
      });
      return context.redirect(
        `${context.env.PUBLIC_ORIGIN}/?oauthError=link_confirmation_sent`,
        302,
      );
    }

    const user = resolution.user;
    if (user.disabled_at) {
      return oauthFailure(context.env, "account_disabled");
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
      type: `oauth_${provider}_succeeded`,
      request: context.req.raw,
    });
    context.header(
      "Set-Cookie",
      makeSessionCookie(context.req.raw, context.env, created.token),
      { append: true },
    );
    if (!user.username) {
      const welcome = new URL("/welcome", context.env.PUBLIC_ORIGIN);
      welcome.searchParams.set("returnTo", result.returnTo);
      return context.redirect(welcome.toString(), 302);
    }
    return context.redirect(result.returnTo, 302);
  });

  app.post("/api/oauth/link", async (context) => {
    const body = oauthLinkSchema.safeParse(await context.req.json());
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }

    const limit = await rateLimit(
      context.env,
      "oauth-link",
      clientIp(context.req.raw),
      10,
      3600,
    );
    if (!limit.allowed) return rateLimitError(context, limit.retryAfter);

    const key = `oauthlink:${await hashToken(body.data.token)}`;
    const pending = await context.env.SESSIONS.get<{
      provider: string;
      subject: string;
      userId: string;
    }>(key, "json");
    if (!pending) {
      return apiError(
        context,
        400,
        "invalid_token",
        "This linking request is invalid or has expired.",
      );
    }

    await context.env.DB.prepare(
      `INSERT INTO identities (
       id, user_id, provider, provider_subject, password_hash
     ) VALUES (?, ?, ?, ?, NULL)`,
    )
      .bind(
        crypto.randomUUID(),
        pending.userId,
        pending.provider,
        pending.subject,
      )
      .run();
    await context.env.SESSIONS.delete(key);
    await safeAudit(context.env, {
      userId: pending.userId,
      type: `oauth_${pending.provider}_linked`,
      request: context.req.raw,
    });

    return context.json({ ok: true, provider: pending.provider });
  });
}
