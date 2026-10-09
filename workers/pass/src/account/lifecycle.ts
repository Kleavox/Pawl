import type { Identity } from "@pawl/core";
import { INTERNAL_URLS } from "@pawl/config";
import type { AccountCredential } from "@pawl/protocol";

import type { Env } from "../env";
import { writeAuditEvent } from "../lib/audit";
import {
  invalidateUserSessions,
  purgeUserSessions,
  putIdentityOverride,
} from "../lib/session";
import { findAccountKeys, prepareAccountKeysUpsert } from "./credentials";

type SetupAccountResult =
  | { kind: "ready"; identity: Identity }
  | { kind: "already_set" }
  | { kind: "username_taken" };

type DeleteAccountResult = { kind: "deleted" } | { kind: "purge_failed" };
type SetCredentialResult = { kind: "created" } | { kind: "exists" };
type ResetCredentialResult = { kind: "reset" } | { kind: "invalid_token" };

export interface AccountLifecycle {
  setup(input: {
    identity: Identity;
    username: string;
    keys?: AccountCredential;
    request: Request;
  }): Promise<SetupAccountResult>;
  delete(input: {
    userId: string;
    request: Request;
  }): Promise<DeleteAccountResult>;
  setCredential(input: {
    userId: string;
    keys: AccountCredential;
    request: Request;
  }): Promise<SetCredentialResult>;
  resetCredential(input: {
    tokenHash: string;
    keys: AccountCredential;
    request: Request;
    now?: number;
  }): Promise<ResetCredentialResult>;
}

interface ResetTokenRow {
  id: string;
  user_id: string;
  expires_at: string;
  auth_version: number;
}

export function createAccountLifecycle(env: Env): AccountLifecycle {
  return {
    async setup(input) {
      const current = await env.DB.prepare(
        `SELECT username FROM users WHERE id = ?`,
      )
        .bind(input.identity.id)
        .first<{ username: string | null }>();
      if (current?.username) return { kind: "already_set" };

      const taken = await env.DB.prepare(
        `SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1`,
      )
        .bind(input.username, input.identity.id)
        .first<{ id: string }>();
      if (taken) return { kind: "username_taken" };

      const statements = [
        env.DB.prepare(
          `UPDATE users
           SET username = ?, updated_at = datetime('now')
           WHERE id = ?`,
        ).bind(input.username, input.identity.id),
      ];
      if (input.keys) {
        statements.push(
          await prepareAccountKeysUpsert(env, input.identity.id, input.keys),
        );
      }
      await env.DB.batch(statements);

      const identity = { ...input.identity, username: input.username };
      await putIdentityOverride(env, identity);
      await audit(env, input.request, identity.id, "account_setup");
      return { kind: "ready", identity };
    },

    async delete(input) {
      if (!env.LINK) return { kind: "purge_failed" };

      let response: Response;
      try {
        response = await env.LINK.fetch(
          `${INTERNAL_URLS.LINK_PURGE}?id=${input.userId}`,
          { method: "POST" },
        );
      } catch {
        return { kind: "purge_failed" };
      }
      if (!response.ok) return { kind: "purge_failed" };

      await audit(env, input.request, input.userId, "account_deleted");
      await env.DB.prepare(`DELETE FROM users WHERE id = ?`)
        .bind(input.userId)
        .run();
      await purgeUserSessions(env, input.userId);
      await Promise.all([
        env.SESSIONS.delete(`identity:${input.userId}`),
        env.SESSIONS.delete(`auth-version:${input.userId}`),
      ]);
      return { kind: "deleted" };
    },

    async setCredential(input) {
      if (await findAccountKeys(env, input.userId)) return { kind: "exists" };
      await (
        await prepareAccountKeysUpsert(env, input.userId, input.keys)
      ).run();
      await audit(env, input.request, input.userId, "password_set");
      return { kind: "created" };
    },

    async resetCredential(input) {
      const token = await env.DB.prepare(
        `SELECT vt.id, vt.user_id, vt.expires_at, u.auth_version
         FROM verification_tokens vt
         JOIN users u ON u.id = vt.user_id
         WHERE vt.token_hash = ? AND vt.purpose = 'PASSWORD_RESET'
           AND vt.consumed_at IS NULL
         LIMIT 1`,
      )
        .bind(input.tokenHash)
        .first<ResetTokenRow>();
      if (!token || Date.parse(token.expires_at) <= (input.now ?? Date.now())) {
        return { kind: "invalid_token" };
      }

      const nextAuthVersion = token.auth_version + 1;
      await env.DB.batch([
        await prepareAccountKeysUpsert(env, token.user_id, input.keys),
        env.DB.prepare(
          `UPDATE users
           SET auth_version = ?, updated_at = datetime('now')
           WHERE id = ?`,
        ).bind(nextAuthVersion, token.user_id),
        env.DB.prepare(
          `UPDATE verification_tokens
           SET consumed_at = datetime('now')
           WHERE id = ?`,
        ).bind(token.id),
        env.DB.prepare(
          `DELETE FROM verification_tokens
           WHERE user_id = ? AND purpose = 'PASSWORD_RESET' AND id != ?`,
        ).bind(token.user_id, token.id),
      ]);
      await invalidateUserSessions(env, token.user_id, nextAuthVersion);
      await purgeUserSessions(env, token.user_id);
      await audit(
        env,
        input.request,
        token.user_id,
        "password_reset_completed",
      );
      return { kind: "reset" };
    },
  };
}

async function audit(
  env: Env,
  request: Request,
  userId: string,
  type: string,
): Promise<void> {
  try {
    await writeAuditEvent(env, { userId, type, request });
  } catch (cause) {
    console.error("[pass audit]", cause);
  }
}
