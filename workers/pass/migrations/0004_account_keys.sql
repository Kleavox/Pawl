CREATE TABLE account_keys (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kdf_salt TEXT NOT NULL,
  auth_verifier_hash TEXT NOT NULL,
  account_public_key TEXT NOT NULL,
  wrapped_private_key TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
