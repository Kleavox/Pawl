import type { AccountCredential } from "@pawl/protocol";

import type { Env } from "../env";
import { hashAuthVerifier } from "../lib/crypto";

export interface AccountKeysRow {
  kdf_salt: string;
  auth_verifier_hash: string;
  account_public_key: string;
  wrapped_private_key: string;
}

export async function findAccountKeys(
  env: Env,
  userId: string,
): Promise<AccountKeysRow | null> {
  return env.DB.prepare(
    `SELECT kdf_salt, auth_verifier_hash, account_public_key,
            wrapped_private_key
     FROM account_keys WHERE user_id = ?`,
  )
    .bind(userId)
    .first<AccountKeysRow>();
}

export async function prepareAccountKeysUpsert(
  env: Env,
  userId: string,
  keys: AccountCredential,
): Promise<D1PreparedStatement> {
  return env.DB.prepare(
    `INSERT INTO account_keys
       (user_id, kdf_salt, auth_verifier_hash, account_public_key,
        wrapped_private_key)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       kdf_salt = excluded.kdf_salt,
       auth_verifier_hash = excluded.auth_verifier_hash,
       account_public_key = excluded.account_public_key,
       wrapped_private_key = excluded.wrapped_private_key,
       updated_at = datetime('now')`,
  ).bind(
    userId,
    keys.salt,
    await hashAuthVerifier(keys.authVerifier),
    keys.accountPublicKey,
    keys.wrappedPrivateKey,
  );
}
