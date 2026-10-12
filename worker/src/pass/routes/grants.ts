import { findGrant, revokeGrantFor } from "../oidc/grants";
import { apiError, currentSession, type PassApp } from "./shared";

interface ConnectedRow {
  client_id: string;
  name: string;
  homepage: string | null;
  sector: string;
  scopes: string;
  created_at: string;
}

export function registerGrantRoutes(app: PassApp): void {
  app.get("/api/account/grants", async (context) => {
    const session = await currentSession(context);
    if (!session) {
      return apiError(context, 401, "unauthorized", "Sign in first.");
    }
    const rows = await context.env.DB.prepare(
      `SELECT g.client_id, c.name, c.homepage, c.sector, g.scopes, g.created_at
       FROM oauth_grants g
       JOIN oauth_clients c ON c.id = g.client_id
       WHERE g.user_id = ? AND g.revoked_at IS NULL AND c.first_party = 0
       ORDER BY g.created_at DESC`,
    )
      .bind(session.identity.id)
      .all<ConnectedRow>();
    return context.json({
      grants: rows.results.map((row) => ({
        clientId: row.client_id,
        name: row.name,
        homepage: row.homepage,
        sector: row.sector,
        scopes: JSON.parse(row.scopes) as string[],
        createdAt: row.created_at,
      })),
    });
  });

  app.delete("/api/account/grants/:clientId", async (context) => {
    const session = await currentSession(context);
    if (!session) {
      return apiError(context, 401, "unauthorized", "Sign in first.");
    }
    const clientId = context.req.param("clientId");
    if (!(await findGrant(context.env, session.identity.id, clientId))) {
      return apiError(
        context,
        404,
        "not_found",
        "That app is not connected to this account.",
      );
    }
    await revokeGrantFor(context.env, session.identity.id, clientId);
    return context.body(null, 204);
  });
}
