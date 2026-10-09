import type { Env } from "../env";
import { hashAuditIp } from "./crypto";

interface AuditEvent {
  userId?: string;
  type: string;
  request: Request;
  metadata?: Record<string, unknown>;
}

export async function writeAuditEvent(
  env: Env,
  event: AuditEvent,
): Promise<void> {
  const ip = event.request.headers.get("cf-connecting-ip") ?? "unknown";
  const ipHash = await hashAuditIp(
    ip,
    env.IP_HASH_SECRET ?? "local-development",
  );
  const userAgent = (
    event.request.headers.get("user-agent") ?? "unknown"
  ).slice(0, 512);

  await env.DB.prepare(
    `INSERT INTO auth_events (
       id, user_id, event_type, ip_hash, user_agent, metadata_json
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      event.userId ?? null,
      event.type,
      ipHash,
      userAgent,
      event.metadata ? JSON.stringify(event.metadata) : null,
    )
    .run();
}
