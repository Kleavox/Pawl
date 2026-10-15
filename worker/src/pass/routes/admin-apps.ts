import type { SessionIdentity } from "@pawl/core";
import { z } from "zod";

import { getSession, readSessionToken, sessionStartedAt } from "../lib/session";
import {
  listOutsideApps,
  registerOutsideApp,
  removeOutsideApp,
} from "../oidc/outside";
import {
  apiError,
  firstIssue,
  safeAudit,
  type AppEnv,
  type PassApp,
} from "./shared";
import type { Context } from "hono";

const RECENT_SIGN_IN_MS = 15 * 60 * 1000;

const newAppSchema = z
  .object({
    title: z.string({ error: "Give the app a name." }),
    label: z.string({ error: "Give the app a label." }),
    address: z.string({ error: "Give the app's address." }),
    returnTo: z.string().nullable().optional(),
    access: z.enum(["public", "visitor", "owner"], {
      error: "Choose who may take it.",
    }),
    card: z.boolean({ error: "Say whether it shows a card." }),
  })
  .strict();

type Admitted = { session: SessionIdentity } | { refused: Response };

async function admitted(
  context: Context<AppEnv>,
  change: boolean,
): Promise<Admitted> {
  const token = readSessionToken(context.req.raw);
  const session = token ? await getSession(context.env, token) : null;
  if (!token || !session) {
    return {
      refused: apiError(context, 401, "unauthorized", "Sign in first."),
    };
  }
  if (session.identity.role !== "ADMIN") {
    return {
      refused: apiError(
        context,
        403,
        "forbidden",
        "Only an admin can manage registered apps.",
      ),
    };
  }
  if (change) {
    const started = await sessionStartedAt(context.env, token);
    if (started === null || Date.now() - started > RECENT_SIGN_IN_MS) {
      return {
        refused: apiError(
          context,
          403,
          "reauth_required",
          "Sign in again to change registered apps. Your sign-in is older than 15 minutes.",
        ),
      };
    }
  }
  return { session };
}

export function registerAdminAppRoutes(app: PassApp): void {
  app.get("/api/admin/apps", async (context) => {
    const admin = await admitted(context, false);
    if ("refused" in admin) return admin.refused;
    context.header("Cache-Control", "no-store");
    return context.json({ apps: await listOutsideApps(context.env) });
  });

  app.post("/api/admin/apps", async (context) => {
    const admin = await admitted(context, true);
    if ("refused" in admin) return admin.refused;
    let raw: unknown;
    try {
      raw = await context.req.json();
    } catch {
      return apiError(context, 400, "invalid_input", "Send the form as JSON.");
    }
    const body = newAppSchema.safeParse(raw);
    if (!body.success) {
      return apiError(context, 400, "invalid_input", firstIssue(body.error));
    }
    const result = await registerOutsideApp(
      context.env,
      { ...body.data, returnTo: body.data.returnTo ?? null },
      admin.session.identity.id,
    );
    if (result.kind === "invalid") {
      return apiError(context, 400, "invalid_input", result.message);
    }
    await safeAudit(context.env, {
      userId: admin.session.identity.id,
      type: "app_registered",
      request: context.req.raw,
      metadata: { key: result.app.key, origin: result.app.origin },
    });
    context.header("Cache-Control", "no-store");
    return context.json({ app: result.app, secret: result.secret }, 201);
  });

  app.delete("/api/admin/apps/:key", async (context) => {
    const admin = await admitted(context, true);
    if ("refused" in admin) return admin.refused;
    const key = context.req.param("key");
    if (!(await removeOutsideApp(context.env, key))) {
      return apiError(
        context,
        404,
        "not_found",
        "No registered app has that label.",
      );
    }
    await safeAudit(context.env, {
      userId: admin.session.identity.id,
      type: "app_removed",
      request: context.req.raw,
      metadata: { key },
    });
    return context.body(null, 204);
  });
}
