import { readCookie, SESSION_COOKIE } from "@pawl/auth";
import type { Identity, SessionIdentity } from "@pawl/core";
import type { Env } from "../env";
import { SESSION_TTL_SECONDS } from "./cookies";
import { hashToken, randomToken } from "./crypto";

interface StoredSession {
  identity: Identity;
  authVersion: number;
  createdAt: string;
  expiresAt: string;
}

export interface SessionClient {
  userAgent: string | null;
  ip: string | null;
}

export interface SessionDevice extends SessionClient {
  sessionId: string;
  createdAt: string;
  expiresAt: string;
}

export interface CreatedSession {
  token: string;
  session: SessionIdentity;
}

export async function createSession(
  env: Env,
  identity: Identity,
  authVersion: number,
  client?: SessionClient,
): Promise<CreatedSession> {
  const token = randomToken();
  const sessionId = await hashToken(token);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_SECONDS * 1000,
  ).toISOString();
  const stored: StoredSession = {
    identity,
    authVersion,
    createdAt,
    expiresAt,
  };

  await Promise.all([
    env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(stored), {
      expirationTtl: SESSION_TTL_SECONDS,
    }),
    env.SESSIONS.put(`usersession:${identity.id}:${sessionId}`, "1", {
      expirationTtl: SESSION_TTL_SECONDS,
      metadata: {
        createdAt,
        expiresAt,
        userAgent: client?.userAgent ?? null,
        ip: client?.ip ?? null,
      },
    }),
    env.SESSIONS.put(`auth-version:${identity.id}`, authVersion.toString()),
  ]);

  return {
    token,
    session: { identity, sessionId, expiresAt },
  };
}

export async function listSessions(
  env: Env,
  userId: string,
): Promise<SessionDevice[]> {
  const prefix = `usersession:${userId}:`;
  const listing = await env.SESSIONS.list<Omit<SessionDevice, "sessionId">>({
    prefix,
  });
  return listing.keys.map((key) => ({
    sessionId: key.name.slice(prefix.length),
    createdAt: key.metadata?.createdAt ?? "",
    expiresAt: key.metadata?.expiresAt ?? "",
    userAgent: key.metadata?.userAgent ?? null,
    ip: key.metadata?.ip ?? null,
  }));
}

export async function deleteSessionById(
  env: Env,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const metaKey = `usersession:${userId}:${sessionId}`;
  if ((await env.SESSIONS.get(metaKey)) === null) return false;

  await Promise.all([
    env.SESSIONS.delete(`session:${sessionId}`),
    env.SESSIONS.delete(metaKey),
  ]);
  return true;
}

export async function purgeUserSessions(
  env: Env,
  userId: string,
): Promise<void> {
  const sessions = await listSessions(env, userId);
  await Promise.all(
    sessions.flatMap((device) => [
      env.SESSIONS.delete(`session:${device.sessionId}`),
      env.SESSIONS.delete(`usersession:${userId}:${device.sessionId}`),
    ]),
  );
}

export async function getSession(
  env: Env,
  token: string,
): Promise<SessionIdentity | null> {
  const sessionId = await hashToken(token);
  const stored = await env.SESSIONS.get<StoredSession>(
    `session:${sessionId}`,
    "json",
  );

  if (!stored || Date.parse(stored.expiresAt) <= Date.now()) {
    if (stored) {
      await Promise.all([
        env.SESSIONS.delete(`session:${sessionId}`),
        env.SESSIONS.delete(`usersession:${stored.identity.id}:${sessionId}`),
      ]);
    }
    return null;
  }

  const [currentVersion, override, account] = await Promise.all([
    env.SESSIONS.get(`auth-version:${stored.identity.id}`),
    env.SESSIONS.get<Identity>(`identity:${stored.identity.id}`, "json"),
    env.DB.prepare("SELECT role FROM users WHERE id = ? LIMIT 1")
      .bind(stored.identity.id)
      .first<{ role: Identity["role"] }>(),
  ]);
  if (
    currentVersion !== null &&
    Number(currentVersion) !== stored.authVersion
  ) {
    await Promise.all([
      env.SESSIONS.delete(`session:${sessionId}`),
      env.SESSIONS.delete(`usersession:${stored.identity.id}:${sessionId}`),
    ]);
    return null;
  }

  const identity = override ?? stored.identity;
  return {
    identity: account ? { ...identity, role: account.role } : identity,
    sessionId,
    expiresAt: stored.expiresAt,
  };
}

export async function sessionStartedAt(
  env: Env,
  token: string,
): Promise<number | null> {
  const stored = await env.SESSIONS.get<StoredSession>(
    `session:${await hashToken(token)}`,
    "json",
  );
  if (!stored) return null;
  const started = Date.parse(stored.createdAt);
  return Number.isNaN(started) ? null : started;
}

export async function putIdentityOverride(
  env: Env,
  identity: Identity,
): Promise<void> {
  await env.SESSIONS.put(`identity:${identity.id}`, JSON.stringify(identity), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession(env: Env, token: string): Promise<void> {
  const sessionId = await hashToken(token);
  const stored = await env.SESSIONS.get<StoredSession>(
    `session:${sessionId}`,
    "json",
  );
  await Promise.all([
    env.SESSIONS.delete(`session:${sessionId}`),
    stored
      ? env.SESSIONS.delete(`usersession:${stored.identity.id}:${sessionId}`)
      : Promise.resolve(),
  ]);
}

export async function invalidateUserSessions(
  env: Env,
  userId: string,
  authVersion: number,
): Promise<void> {
  await env.SESSIONS.put(`auth-version:${userId}`, authVersion.toString());
}

export function readSessionToken(request: Request): string | null {
  return readCookie(request, SESSION_COOKIE);
}
